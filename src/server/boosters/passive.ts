import "server-only";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { ApiError } from "@/lib/api/errors";
import { db } from "@/lib/db/prisma";

export interface PassiveConfiguration { intervalSeconds: number; maxStock: number }
export interface PassiveState { stock: number; nextGenerationAt: Date | null }
export interface PassiveSnapshot extends PassiveState, PassiveConfiguration { serverTime: Date }

export function validatePassiveConfiguration(configuration: PassiveConfiguration) {
  const { intervalSeconds, maxStock } = configuration;
  if (!Number.isSafeInteger(intervalSeconds) || intervalSeconds < 1 || intervalSeconds > Math.floor(Number.MAX_SAFE_INTEGER / 1000) ||
    !Number.isSafeInteger(maxStock) || maxStock < 1 || maxStock > 10) {
    throw new ApiError("INVALID_GAME_CONFIGURATION", "La configuration des boosters gratuits est invalide.", 503);
  }
}

/** Pure arithmetic for tests; authoritative callers must pass PostgreSQL's clock. */
export function computePassiveGeneration(state: PassiveState, configuration: PassiveConfiguration, now: Date) {
  validatePassiveConfiguration(configuration);
  if (!Number.isSafeInteger(state.stock) || state.stock < 0 || !Number.isFinite(now.getTime()) ||
    (state.nextGenerationAt && !Number.isFinite(state.nextGenerationAt.getTime()))) {
    throw new ApiError("INVALID_PASSIVE_STATE", "Le stock de boosters gratuits est indisponible.", 503);
  }
  const intervalMs = configuration.intervalSeconds * 1000;
  if (state.stock >= configuration.maxStock) return { stock: configuration.maxStock, nextGenerationAt: null, generated: 0 };
  const next = state.nextGenerationAt ?? new Date(now.getTime() + intervalMs);
  if (next.getTime() > now.getTime()) return { stock: state.stock, nextGenerationAt: next, generated: 0 };
  const due = Math.floor((now.getTime() - next.getTime()) / intervalMs) + 1;
  const generated = Math.min(configuration.maxStock - state.stock, due);
  const stock = state.stock + generated;
  return { stock, generated, nextGenerationAt: stock === configuration.maxStock ? null : new Date(next.getTime() + generated * intervalMs) };
}

/** Locks and transaction are retained by the caller until its whole operation commits. */
export async function syncPassiveBoosters(tx: Prisma.TransactionClient, userId: string): Promise<PassiveSnapshot> {
  if (!userId || userId.length > 100) throw new ApiError("INVALID_USER", "Le joueur est invalide.", 400);
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`booster:user:${userId}`}, 0))`;
  const user = await tx.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!user) throw new ApiError("USER_NOT_FOUND", "Le joueur est introuvable.", 404);
  const settings = await tx.gameConfiguration.findUnique({ where: { id: "default" }, select: { passiveIntervalSeconds: true, passiveMaxStock: true } });
  if (!settings) throw new ApiError("INVALID_GAME_CONFIGURATION", "La configuration des boosters gratuits est absente.", 503);
  const configuration = { intervalSeconds: settings.passiveIntervalSeconds, maxStock: settings.passiveMaxStock };
  validatePassiveConfiguration(configuration);
  await tx.$executeRaw`
    INSERT INTO "PassiveBoosterState" ("userId", "stock", "nextGenerationAt", "generatedTotal", "updatedAt")
    VALUES (${userId}, 0, clock_timestamp() + ${configuration.intervalSeconds} * interval '1 second', 0, clock_timestamp())
    ON CONFLICT ("userId") DO NOTHING`;
  const [state] = await tx.$queryRaw<Array<{ stock: number; nextGenerationAt: Date | null }>>`
    SELECT "stock", "nextGenerationAt" FROM "PassiveBoosterState" WHERE "userId" = ${userId} FOR UPDATE`;
  // Acquire clock after the row lock; blocked competitors must not use an old timestamp.
  const [clock] = await tx.$queryRaw<Array<{ now: Date }>>`SELECT clock_timestamp() AS now`;
  if (!state || !clock) throw new ApiError("INVALID_PASSIVE_STATE", "Le stock de boosters gratuits est indisponible.", 503);
  const updated = computePassiveGeneration(state, configuration, clock.now);
  await tx.passiveBoosterState.update({ where: { userId }, data: { stock: updated.stock,
    nextGenerationAt: updated.nextGenerationAt, generatedTotal: { increment: BigInt(updated.generated) } } });
  return { stock: updated.stock, nextGenerationAt: updated.nextGenerationAt, ...configuration, serverTime: clock.now };
}

export async function consumePassiveBooster(tx: Prisma.TransactionClient, userId: string): Promise<PassiveSnapshot> {
  const snapshot = await syncPassiveBoosters(tx, userId);
  if (snapshot.stock < 1) throw new ApiError("NO_PASSIVE_BOOSTER", "Aucun booster gratuit n’est disponible.", 409);
  const nextGenerationAt = snapshot.stock === snapshot.maxStock
    ? new Date(snapshot.serverTime.getTime() + snapshot.intervalSeconds * 1000) : snapshot.nextGenerationAt;
  const stock = snapshot.stock - 1;
  await tx.passiveBoosterState.update({ where: { userId }, data: { stock, nextGenerationAt } });
  return { ...snapshot, stock, nextGenerationAt };
}

/** JSON contract of GET /api/boosters/passive; the countdown is informational only. */
export function serializePassiveSnapshot(snapshot: PassiveSnapshot) {
  return { stock: snapshot.stock, maxStock: snapshot.maxStock, intervalSeconds: snapshot.intervalSeconds,
    nextGenerationAt: snapshot.nextGenerationAt?.toISOString() ?? null, serverTime: snapshot.serverTime.toISOString() };
}

export async function getPassiveBoosters(userId: string, client: PrismaClient = db) {
  return serializePassiveSnapshot(await client.$transaction((tx) => syncPassiveBoosters(tx, userId)));
}
