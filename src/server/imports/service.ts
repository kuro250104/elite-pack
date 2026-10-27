import "server-only";
import type { PrismaClient } from "@/generated/prisma/client";
import type { AthleteProvider } from "@/providers/types";
import { TheSportsDbProvider } from "@/providers/thesportsdb/client";
import { db } from "@/lib/db/prisma";
import { ApiError } from "@/lib/api/errors";
import { applyExternalAthlete } from "@/server/athletes/service";
import { assertAdminActor, importSports } from "@/server/sports/service";
import { consumeRateLimit, deferRateLimit } from "@/server/security/rate-limit";
import { importCommandSchema, idempotencyKeySchema, type ImportCommand } from "./validation";

import { requireSportsDbConfiguration } from "./configuration";

const providerKey = "provider:thesportsdb";
export function configuredProvider(client: PrismaClient = db): AthleteProvider {
  const { apiKey } = requireSportsDbConfiguration();
  return new TheSportsDbProvider({apiKey, maxRetries: 0}, async (url, options) => {
    const response = await fetch(url, options);
    if (response.status === 429) {
      const retryAfter = Number(response.headers.get("retry-after"));
      const seconds = Number.isFinite(retryAfter) ? Math.max(60, Math.min(120, Math.ceil(retryAfter))) : 60;
      await client.$transaction(tx => deferRateLimit(tx, providerKey, seconds));
    }
    return response;
  });
}
export async function reserveProviderRequest(client: PrismaClient = db) {
  await client.$transaction(tx => consumeRateLimit(tx, providerKey, {limit: 30, windowSeconds: 60, minIntervalMs: 2100}));
}
export async function reserveAdminRequest(actorId: string, client: PrismaClient = db) {
  await client.$transaction(async tx => {
    await assertAdminActor(tx, actorId);
    await consumeRateLimit(tx, `admin-api:${actorId}`, {limit: 60, windowSeconds: 60});
  });
}
interface ImportDependencies {
  client?: PrismaClient;
  provider?: () => AthleteProvider;
  reserveProvider?: () => Promise<void>;
}
/** Réseau hors transaction ; données et état final du job sont validés ensemble. */
export async function runImport(actorId: string, key: string, command: ImportCommand, dependencies: ImportDependencies = {}) {
  const client = dependencies.client ?? db;
  const input = importCommandSchema.parse(command);
  const idempotencyKey = idempotencyKeySchema.parse(key);
  const claim = await client.$transaction(async tx => {
    await assertAdminActor(tx, actorId);
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`import:${actorId}:${idempotencyKey}`}, 0))`;
    const existing = await tx.importJob.findUnique({where: {actorId_idempotencyKey: {actorId, idempotencyKey}}});
    if (existing) {
      const stored = importCommandSchema.safeParse(existing.parameters);
      if (!stored.success || JSON.stringify(stored.data) !== JSON.stringify(input)) {
        throw new ApiError("IDEMPOTENCY_CONFLICT", "Cette clé a déjà été utilisée pour un autre import.", 409);
      }
      if (existing.status === "RUNNING" && existing.startedAt && Date.now() - existing.startedAt.getTime() > 120_000) {
        const expired = await tx.importJob.update({where: {id: existing.id}, data: {
          status: "FAILED", completedAt: new Date(), errorMessage: "L’import a été interrompu. Relancez-le avec une nouvelle opération.",
          result: {errorCode: "IMPORT_INTERRUPTED", status: 503},
        }});
        await tx.adminAuditLog.create({data: {actorId, action: "IMPORT_INTERRUPTED", entityType: "ImportJob", entityId: expired.id}});
        return {job: expired, replay: true};
      }
      return {job: existing, replay: true};
    }
    const job = await tx.importJob.create({data: {provider: "THESPORTSDB", actorId, idempotencyKey,
      parameters: input, status: "RUNNING", startedAt: new Date()}});
    await tx.adminAuditLog.create({data: {actorId, action: "IMPORT_STARTED", entityType: "ImportJob", entityId: job.id, after: input}});
    return {job, replay: false};
  });
  if (claim.replay) return claim;
  try {
    const provider = dependencies.provider ? dependencies.provider() : configuredProvider(client);
    await (dependencies.reserveProvider ? dependencies.reserveProvider() : reserveProviderRequest(client));
    const data = input.kind === "sports" ? await provider.getSports() : await provider.getAthlete(input.externalId);
    if (data === null) throw new ApiError("ATHLETE_NOT_FOUND", "Aucun athlète ne correspond à cet identifiant TheSportsDB.", 404);
    if (input.kind === "athlete" && !Array.isArray(data) && data.externalId !== input.externalId) {
      throw new ApiError("INVALID_PROVIDER_RESPONSE", "L’identifiant renvoyé par le fournisseur ne correspond pas à la demande.", 502);
    }
    const job = await client.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM "ImportJob" WHERE id = ${claim.job.id} FOR UPDATE`;
      const current = await tx.importJob.findUniqueOrThrow({where: {id: claim.job.id}});
      if (current.status !== "RUNNING") return current;
      const result = input.kind === "sports"
        ? await importSports(tx, data as Awaited<ReturnType<AthleteProvider["getSports"]>>, actorId)
        : await applyExternalAthlete(tx, data as NonNullable<Awaited<ReturnType<AthleteProvider["getAthlete"]>>>, {actorId, targetAthleteId: input.targetAthleteId});
      const updated = await tx.importJob.update({where: {id: claim.job.id}, data: {status: "COMPLETED", completedAt: new Date(),
        processedCount: "processed" in result ? result.processed : 1, result}});
      await tx.adminAuditLog.create({data: {actorId, action: "IMPORT_COMPLETED", entityType: "ImportJob", entityId: updated.id, after: result}});
      return updated;
    }, {timeout: 15_000});
    return {job, replay: false};
  } catch (error) {
    const safe = error instanceof ApiError ? error : new ApiError("PROVIDER_ERROR", "L’import a échoué. Vérifiez la source et réessayez avec une nouvelle opération.", 502);
    const job = await client.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM "ImportJob" WHERE id = ${claim.job.id} FOR UPDATE`;
      const current = await tx.importJob.findUniqueOrThrow({where: {id: claim.job.id}});
      if (current.status !== "RUNNING") return current;
      const updated = await tx.importJob.update({where: {id: claim.job.id}, data: {status: "FAILED", completedAt: new Date(),
        errorMessage: safe.message, result: {errorCode: safe.code, status: safe.status, ...(safe.retryAfter ? {retryAfter: safe.retryAfter} : {})}}});
      await tx.adminAuditLog.create({data: {actorId, action: "IMPORT_FAILED", entityType: "ImportJob", entityId: updated.id, after: {code: safe.code}}});
      return updated;
    });
    return {job, replay: false};
  }
}
