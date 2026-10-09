import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { ApiError } from "@/lib/api/errors";

export interface RateLimitOptions {
  limit: number;
  windowSeconds: number;
  minIntervalMs?: number;
}

/**
 * Réserve un quota partagé dans une transaction PostgreSQL.
 * L'appelant doit valider cette transaction avant tout appel réseau.
 * Utiliser un ordre stable des clés si plusieurs quotas sont réservés ensemble.
 */
export async function consumeRateLimit(
  tx: Prisma.TransactionClient,
  key: string,
  { limit, windowSeconds, minIntervalMs = 0 }: RateLimitOptions,
): Promise<void> {
  if (!key || key.length > 300 || !Number.isSafeInteger(limit) || limit < 1 ||
    !Number.isSafeInteger(windowSeconds) || windowSeconds < 1 ||
    !Number.isSafeInteger(minIntervalMs) || minIntervalMs < 0) {
    throw new Error("Configuration de limitation invalide.");
  }

  await tx.$executeRaw`
    INSERT INTO "RateLimitBucket" ("key", "windowStart", "count")
    VALUES (${key}, clock_timestamp(), 0)
    ON CONFLICT ("key") DO NOTHING
  `;
  const [bucket] = await tx.$queryRaw<Array<{
    windowStart: Date; count: number; nextAllowedAt: Date | null;
  }>>`
    SELECT "windowStart", "count", "nextAllowedAt"
    FROM "RateLimitBucket" WHERE "key" = ${key} FOR UPDATE
  `;
  // Lire l'horloge après acquisition du verrou : un concurrent peut avoir attendu.
  const [clock] = await tx.$queryRaw<Array<{ now: Date }>>`SELECT clock_timestamp() AS now`;
  if (!bucket || !clock) throw new Error("État du quota indisponible.");
  const now = clock.now.getTime();
  const windowMs = windowSeconds * 1000;
  const expired = now >= bucket.windowStart.getTime() + windowMs;
  const count = expired ? 0 : bucket.count;
  const windowStart = expired ? clock.now : bucket.windowStart;
  const quotaRetryAt = count >= limit ? windowStart.getTime() + windowMs : now;
  const spacingRetryAt = bucket.nextAllowedAt?.getTime() ?? now;
  const retryAt = Math.max(quotaRetryAt, spacingRetryAt);
  if (retryAt > now) {
    throw new ApiError("RATE_LIMITED", "Trop de requêtes. Réessayez dans quelques instants.", 429,
      Math.max(1, Math.ceil((retryAt - now) / 1000)));
  }
  const nextAllowedAt = minIntervalMs > 0 ? new Date(now + minIntervalMs) : null;
  await tx.$executeRaw`
    UPDATE "RateLimitBucket"
    SET "windowStart" = ${windowStart}, "count" = ${count + 1}, "nextAllowedAt" = ${nextAllowedAt}
    WHERE "key" = ${key}
  `;
}

/** Propage un délai fournisseur (429) à toutes les instances sans raccourcir un délai existant. */
export async function deferRateLimit(
  tx: Prisma.TransactionClient,
  key: string,
  seconds: number,
): Promise<void> {
  if (!key || key.length > 300 || !Number.isSafeInteger(seconds) || seconds < 1 || seconds > 86400) {
    throw new Error("Délai de limitation invalide.");
  }
  await tx.$executeRaw`
    INSERT INTO "RateLimitBucket" ("key", "windowStart", "count", "nextAllowedAt")
    VALUES (${key}, clock_timestamp(), 0, clock_timestamp() + ${seconds} * interval '1 second')
    ON CONFLICT ("key") DO UPDATE SET "nextAllowedAt" =
      GREATEST("RateLimitBucket"."nextAllowedAt", clock_timestamp() + ${seconds} * interval '1 second')
  `;
}
