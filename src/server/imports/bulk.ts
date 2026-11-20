import "server-only";
import { z } from "zod";
import type { PrismaClient } from "@/generated/prisma/client";
import { ProviderRequestError, type AthleteProvider, type ExternalAthlete } from "@/providers/types";
import { db } from "@/lib/db/prisma";
import { ApiError } from "@/lib/api/errors";
import { applyExternalAthlete } from "@/server/athletes/service";
import { recomputeSportPrestige } from "@/server/athletes/prestige";
import { ensureDefaultEditions } from "@/server/cards/default-editions";
import { discoveryBoosterId } from "@/server/game/catalog";
import { assertAdminActor, ensureSportByProviderName, updateSport } from "@/server/sports/service";
import { configuredProvider, reserveProviderRequest } from "./service";

export const bulkImportOptionsSchema = z.object({
  // League names as TheSportsDB spells them, e.g. "French Ligue 1".
  leagues: z.array(z.string().trim().min(2).max(100)).min(1).max(20),
  // One extra call per new athlete; the prestige score is computed from these honours.
  honours: z.boolean().default(true),
  // Athletes already linked to TheSportsDB are left to the periodic sync, which saves the quota.
  refreshExisting: z.boolean().default(false),
  // With refreshExisting: only linked athletes whose honours were never fetched (resumes an interrupted honours pass).
  missingHonoursOnly: z.boolean().default(false),
  // Imported sports stay inactive unless the administrator explicitly asks to activate them.
  activateSports: z.boolean().default(false),
  // Booster that receives the default editions; null creates editions without booster eligibility.
  boosterTypeId: z.string().min(1).max(200).nullable().default(discoveryBoosterId),
  // Spacing between provider calls. Measured on 17 November 2026: the free key answers 429 after about
  // ten calls per minute, well below the documented 30, so one call every 6 s avoids the one-minute penalty.
  minIntervalMs: z.number().int().min(2_100).max(60_000).default(6_000),
}).strict();
export type BulkImportOptions = z.input<typeof bulkImportOptionsSchema>;

export type BulkImportEvent =
  | { type: "league"; league: string; teams: number }
  | { type: "team"; league: string; team: string; players: number }
  | { type: "athlete"; name: string; status: "created" | "updated" | "skipped" | "failed"; error?: string }
  | { type: "waiting"; seconds: number };

interface BulkImportDependencies {
  client?: PrismaClient;
  provider?: () => AthleteProvider;
  reserveProvider?: () => Promise<void>;
  wait?: (ms: number) => Promise<void>;
  onEvent?: (event: BulkImportEvent) => void;
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const maxQuotaRetries = 5;
const maxNetworkRetries = 3;

/**
 * Imports every athlete the provider lists for the given leagues (teams, then players of each team),
 * gives each one the six default editions and makes them eligible for the discovery booster.
 * Network calls happen outside transactions; each athlete is committed on its own, so an interrupted run
 * can simply be started again: linked athletes are skipped. Never runs during booster openings.
 */
export async function runBulkImport(actorId: string, input: BulkImportOptions, dependencies: BulkImportDependencies = {}) {
  const client = dependencies.client ?? db;
  const options = bulkImportOptionsSchema.parse(input);
  const wait = dependencies.wait ?? sleep;
  const emit = dependencies.onEvent ?? (() => undefined);
  await client.$transaction((tx) => assertAdminActor(tx, actorId));
  const provider = dependencies.provider ? dependencies.provider() : configuredProvider(client);
  if (!provider.capabilities.teams || !provider.getTeamsByLeague || !provider.getTeamPlayers) {
    throw new ApiError("PROVIDER_CAPABILITY", "Ce fournisseur ne permet pas de lister les équipes et leurs joueurs.", 501);
  }
  const reserve = dependencies.reserveProvider ?? (() => reserveProviderRequest(client));
  let lastCall = 0;

  /**
   * Waits for the shared quota and the local spacing, then retries a 429 after the provider's one-minute recovery,
   * and a network failure or 5xx (e.g. after the computer slept) a few times before giving up.
   */
  async function call<T>(request: () => Promise<T>): Promise<T> {
    let networkFailures = 0;
    for (let attempt = 1; ; attempt++) {
      for (let slot = 0; ; slot++) {
        try { await reserve(); break; } catch (error) {
          if (!(error instanceof ApiError && error.status === 429) || slot >= 60) throw error;
          const seconds = Math.min(120, Math.max(1, error.retryAfter ?? 1));
          if (seconds > 5) emit({ type: "waiting", seconds });
          await wait(seconds * 1000);
        }
      }
      const spacing = lastCall + options.minIntervalMs - Date.now();
      if (spacing > 0) await wait(spacing);
      lastCall = Date.now();
      try { return await request(); } catch (error) {
        if (error instanceof ProviderRequestError && error.status === 429) {
          if (attempt >= maxQuotaRetries) throw error;
          emit({ type: "waiting", seconds: 65 });
          await wait(65_000);
          continue;
        }
        // Validation errors are not transient; provider unavailability and 5xx are.
        const transient = (error instanceof ProviderRequestError && error.status >= 500) || (!(error instanceof ProviderRequestError) &&
          error instanceof Error && error.name !== "ZodError");
        if (!transient || ++networkFailures > maxNetworkRetries) throw error;
        emit({ type: "waiting", seconds: 30 * networkFailures });
        await wait(30_000 * networkFailures);
      }
    }
  }

  const sportIds = new Set<string>();
  const createdSports: string[] = [];
  const leagues: { league: string; teams: number; players: number; created: number; updated: number; skipped: number; failed: number }[] = [];
  const failures: { name: string; externalId: string; code: string }[] = [];
  let editionsCreated = 0;

  for (const league of options.leagues) {
    const row = { league, teams: 0, players: 0, created: 0, updated: 0, skipped: 0, failed: 0 };
    leagues.push(row);
    const teams = await call(() => provider.getTeamsByLeague!(league));
    row.teams = teams.length;
    emit({ type: "league", league, teams: teams.length });
    for (const team of teams) {
      const players = await call(() => provider.getTeamPlayers!(team.externalId));
      emit({ type: "team", league, team: team.name, players: players.length });
      for (const player of players) {
        row.players++;
        const athlete: ExternalAthlete = { ...player, sportName: player.sportName ?? team.sportName };
        const linked = await client.athleteExternalId.findUnique({ where: { provider_externalId: { provider: "THESPORTSDB", externalId: athlete.externalId } },
          select: { athleteId: true, athlete: { select: { achievements: true } } } });
        // Prisma reads an absent jsonb value as null; an empty honours list is stored as [].
        const honoursKnown = linked !== null && linked.athlete.achievements !== null;
        if (linked && (!options.refreshExisting || (options.missingHonoursOnly && honoursKnown))) {
          // Still make sure an athlete imported earlier, one by one, is playable.
          const result = await client.$transaction((tx) => ensureDefaultEditions(tx, linked.athleteId, options.boosterTypeId));
          editionsCreated += result.created;
          const { sportId } = await client.athlete.findUniqueOrThrow({ where: { id: linked.athleteId }, select: { sportId: true } });
          sportIds.add(sportId);
          row.skipped++;
          emit({ type: "athlete", name: athlete.fullName, status: "skipped" });
          continue;
        }
        if (options.honours && provider.capabilities.honours && provider.getHonours) {
          // Optional enrichment: without honours the athlete is still imported, with a prestige of 0 until the next sync.
          try { athlete.honours = await call(() => provider.getHonours!(athlete.externalId)); } catch { athlete.honours = undefined; }
        }
        try {
          const result = await client.$transaction(async (tx) => {
            if (!athlete.sportName) throw new ApiError("SPORT_MAPPING_REQUIRED", "Le fournisseur n’indique pas le sport de cet athlète.", 409);
            const { sport, created } = await ensureSportByProviderName(tx, athlete.sportName, actorId);
            const imported = await applyExternalAthlete(tx, athlete, { actorId });
            const editions = await ensureDefaultEditions(tx, imported.athleteId, options.boosterTypeId);
            return { ...imported, sportId: sport.id, sportCreated: created ? sport.nameFr : null, editions: editions.created };
          }, { timeout: 15_000 });
          // Recorded after the commit: a rolled-back athlete must not report a sport that does not exist.
          if (result.sportCreated) createdSports.push(result.sportCreated);
          sportIds.add(result.sportId);
          editionsCreated += result.editions;
          row[result.action === "updated" ? "updated" : "created"]++;
          emit({ type: "athlete", name: athlete.fullName, status: result.action === "updated" ? "updated" : "created" });
        } catch (error) {
          const code = error instanceof ApiError ? error.code : "IMPORT_FAILED";
          row.failed++;
          failures.push({ name: athlete.fullName, externalId: athlete.externalId, code });
          emit({ type: "athlete", name: athlete.fullName, status: "failed", error: code });
        }
      }
    }
  }

  // Prestige is relative to the sport: compute it once per sport, after all of its athletes are in. It also revalues editions.
  const sports: { sportId: string; active: boolean; error?: string }[] = [];
  for (const sportId of [...sportIds].sort()) {
    await client.$transaction(async (tx) => {
      let active = (await tx.sport.findUniqueOrThrow({ where: { id: sportId }, select: { active: true } })).active;
      let error: string | undefined;
      if (options.activateSports && !active) {
        try { active = (await updateSport(tx, sportId, { active: true }, actorId)).active; }
        catch (failure) { error = failure instanceof ApiError ? failure.code : "SPORT_ACTIVATION_FAILED"; }
      }
      await recomputeSportPrestige(tx, sportId, actorId);
      sports.push({ sportId, active, ...(error ? { error } : {}) });
    }, { timeout: 60_000 });
  }

  const summary = { leagues, sports, createdSports, editionsCreated, failures,
    totals: { players: leagues.reduce((sum, row) => sum + row.players, 0), created: leagues.reduce((sum, row) => sum + row.created, 0),
      updated: leagues.reduce((sum, row) => sum + row.updated, 0), skipped: leagues.reduce((sum, row) => sum + row.skipped, 0),
      failed: failures.length } };
  await client.adminAuditLog.create({ data: { actorId, action: "ATHLETE_BULK_IMPORT", entityType: "Athlete",
    after: { ...summary, options: { ...options } } } });
  return summary;
}
