import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { db } from "@/lib/db/prisma";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import type { AthleteProvider } from "@/providers/types";
import { assertAdminActor } from "@/server/sports/service";
import { reserveProviderRequest, runImport, waitForProviderSlot } from "./service";

export const syncOptionsSchema = z.object({
  // Each athlete costs two provider calls (player and honours), 2.1 s apart: 8 athletes fit in about 40 seconds.
  limit: z.number().int().min(1).max(20).default(8),
  // Athletes refreshed more recently than this are skipped, which spreads the free quota over the whole catalogue.
  olderThanHours: z.number().int().min(0).max(24 * 30).default(24),
}).strict();
export type SyncOptions = z.input<typeof syncOptionsSchema>;
type SyncDependencies = { client?: PrismaClient; provider?: () => AthleteProvider; reserveProvider?: () => Promise<void> };

/** Athletes linked to TheSportsDB, least recently refreshed first; AthleteExternalId.importedAt is the last sync time. */
export async function staleAthletes(options: { limit: number; olderThanHours: number }, client: PrismaClient | Prisma.TransactionClient = db) {
  return client.athleteExternalId.findMany({
    where: { provider: "THESPORTSDB", importedAt: { lt: new Date(Date.now() - options.olderThanHours * 3600 * 1000) }, athlete: { active: true } },
    orderBy: [{ importedAt: "asc" }, { id: "asc" }], take: options.limit,
    select: { externalId: true, importedAt: true, athlete: { select: { id: true, name: true } } },
  });
}

/**
 * Refreshes a batch of athletes through the regular import (one audited ImportJob each, administrator corrections kept).
 * Never runs per user and never during booster openings. Stops at the first provider refusal so the quota recovers.
 */
export async function syncAthletes(actorId: string, input: SyncOptions = {}, dependencies: SyncDependencies = {}) {
  const client = dependencies.client ?? db;
  const options = syncOptionsSchema.parse(input);
  await client.$transaction((tx) => assertAdminActor(tx, actorId));
  const batch = await staleAthletes(options, client);
  // Consecutive imports share the one-call-every-2.1-s slot: wait for it instead of failing the next athlete.
  const reserveProvider = () => waitForProviderSlot(dependencies.reserveProvider ?? (() => reserveProviderRequest(client)));
  const results: { athleteId: string; name: string; status: string; changed: string[]; error?: string }[] = [];
  let stoppedByQuota = false;
  for (const entry of batch) {
    const { job } = await runImport(actorId, randomUUID(), { kind: "athlete", externalId: entry.externalId },
      { client, provider: dependencies.provider, reserveProvider });
    const result = (job.result ?? {}) as { changed?: string[]; errorCode?: string; status?: number };
    results.push({ athleteId: entry.athlete.id, name: entry.athlete.name, status: job.status, changed: result.changed ?? [],
      ...(result.errorCode ? { error: result.errorCode } : {}) });
    if (job.status === "FAILED" && result.status === 429) { stoppedByQuota = true; break; }
  }
  const summary = { candidates: batch.length, processed: results.length, updated: results.filter((row) => row.changed.length > 0).length,
    failed: results.filter((row) => row.status === "FAILED").length, stoppedByQuota, results };
  await client.adminAuditLog.create({ data: { actorId, action: "ATHLETE_SYNC", entityType: "Athlete",
    after: { ...summary, limit: options.limit, olderThanHours: options.olderThanHours } } });
  return summary;
}

/** Overview for the admin page: freshness of the catalogue and the latest runs. */
export async function syncOverview(client: PrismaClient = db) {
  const [linked, stale, oldest, runs] = await Promise.all([
    client.athleteExternalId.count({ where: { provider: "THESPORTSDB", athlete: { active: true } } }),
    client.athleteExternalId.count({ where: { provider: "THESPORTSDB", athlete: { active: true }, importedAt: { lt: new Date(Date.now() - 24 * 3600 * 1000) } } }),
    staleAthletes({ limit: 20, olderThanHours: 0 }, client),
    client.adminAuditLog.findMany({ where: { action: "ATHLETE_SYNC" }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 10,
      select: { id: true, createdAt: true, after: true, actor: { select: { name: true, email: true } } } }),
  ]);
  return { linked, stale, oldest: oldest.map((row) => ({ athleteId: row.athlete.id, name: row.athlete.name, syncedAt: row.importedAt.toISOString() })),
    runs: runs.map((run) => ({ id: run.id, createdAt: run.createdAt.toISOString(), actor: run.actor.name ?? run.actor.email ?? "Administrateur",
      summary: run.after as { candidates: number; processed: number; updated: number; failed: number; stoppedByQuota: boolean } })) };
}
