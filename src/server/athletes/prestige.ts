import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { ApiError } from "@/lib/api/errors";

/**
 * Prestige is derived from the honours stored in Athlete.achievements (TheSportsDB lookuphonours.php).
 * Honours of unrelated sports are never compared: scores are percentile ranks inside one sport.
 * The administrator override (prestigeOverride) is a separate column and is never modified here.
 */
export function honourPoints(achievements: Prisma.JsonValue | null): number {
  if (!Array.isArray(achievements)) return 0;
  const distinct = new Set<string>();
  for (const entry of achievements) {
    if (typeof entry === "string" && entry.trim()) distinct.add(entry.trim().toLowerCase());
    else if (entry && typeof entry === "object" && !Array.isArray(entry)) {
      const title = entry.title ?? entry.name;
      if (typeof title === "string" && title.trim()) distinct.add(`${title.trim().toLowerCase()}|${String(entry.year ?? "")}`);
    }
  }
  return distinct.size;
}

/**
 * Mid-rank percentile within the sport, 0–100. Athletes without honours score 0; tied athletes share a score.
 * With the free API key (five honours at most) many leaders tie; a premium key widens the spread without code changes.
 */
export function prestigeWithinSport(points: ReadonlyMap<string, number>): Map<string, number> {
  const values = [...points.values()];
  const scores = new Map<string, number>();
  for (const [athleteId, value] of points) {
    if (value <= 0) { scores.set(athleteId, 0); continue; }
    const below = values.filter((other) => other < value).length;
    const tied = values.filter((other) => other === value).length;
    scores.set(athleteId, Math.min(100, Math.max(1, Math.round(((below + tied / 2) / values.length) * 100))));
  }
  return scores;
}

/** Recomputes every athlete of one sport inside the caller's transaction and records the change. */
export async function recomputeSportPrestige(tx: Prisma.TransactionClient, sportId: string, actorId: string) {
  const actor = await tx.user.findUnique({ where: { id: actorId }, select: { role: true } });
  if (actor?.role !== "ADMIN") throw new ApiError("FORBIDDEN", "Cette opération est réservée aux administrateurs.", 403);
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`prestige:sport:${sportId}`}, 0))`;
  const athletes = await tx.athlete.findMany({ where: { sportId }, select: { id: true, achievements: true, prestigeScore: true } });
  const scores = prestigeWithinSport(new Map(athletes.map((athlete) => [athlete.id, honourPoints(athlete.achievements)])));
  const changed = athletes.filter((athlete) => scores.get(athlete.id) !== athlete.prestigeScore);
  for (const athlete of changed) await tx.athlete.update({ where: { id: athlete.id }, data: { prestigeScore: scores.get(athlete.id)! } });
  const result = { sportId, athletes: athletes.length, changed: changed.length };
  await tx.adminAuditLog.create({ data: { actorId, action: "PRESTIGE_RECOMPUTE", entityType: "Sport", entityId: sportId, after: result } });
  return result;
}
