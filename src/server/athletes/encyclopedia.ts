import "server-only";
import { z } from "zod";
import { db } from "@/lib/db/prisma";
import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import type { CardRarity } from "@/components/cards/athlete-card";
import { ApiError } from "@/lib/api/errors";
import { displayableAthleteImage } from "@/server/images/presentation";

const text = z.string().trim().min(1).max(100);
export const encyclopediaQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(10000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(24),
  sportId: text.optional(), query: text.optional(),
  discovered: z.enum(["all", "yes", "no"]).default("all"),
}).strict();
export type EncyclopediaQuery = z.infer<typeof encyclopediaQuerySchema>;

// Only athletes a player can meet in the game are listed: active athlete in an active sport.
const listed = Prisma.sql`a.active AND s.active`;
const discoveredBy = (actorId: string) => Prisma.sql`EXISTS (SELECT 1 FROM "CardDiscovery" d
  JOIN "CardEdition" de ON de.id = d."editionId" WHERE de."athleteId" = a.id AND d."userId" = ${actorId})`;

async function assertPlayer(client: PrismaClient, actorId: string) {
  if (!await client.user.findUnique({ where: { id: actorId }, select: { id: true } }))
    throw new ApiError("UNAUTHENTICATED", "Veuillez vous connecter.", 401);
}

export async function listEncyclopedia(actorId: string, input: unknown, client: PrismaClient = db) {
  const params = encyclopediaQuerySchema.parse(input);
  await assertPlayer(client, actorId);
  const clauses = [listed];
  if (params.sportId) clauses.push(Prisma.sql`a."sportId" = ${params.sportId}`);
  if (params.query) clauses.push(Prisma.sql`a.name ILIKE ${`%${params.query.replace(/[\\%_]/gu, (match) => `\\${match}`)}%`}`);
  if (params.discovered === "yes") clauses.push(discoveredBy(actorId));
  if (params.discovered === "no") clauses.push(Prisma.sql`NOT ${discoveredBy(actorId)}`);
  const from = Prisma.sql`FROM "Athlete" a JOIN "Sport" s ON s.id = a."sportId" WHERE ${Prisma.join(clauses, " AND ")}`;
  const [rows, [count]] = await Promise.all([
    client.$queryRaw<{ id: string; name: string; sport: string; nationality: string | null; prestige: number;
      discovered: boolean; editions: bigint; owned: bigint }[]>`
      SELECT a.id, a.name, s."nameFr" AS sport, a.nationality, COALESCE(a."prestigeOverride", a."prestigeScore") AS prestige,
        ${discoveredBy(actorId)} AS discovered,
        (SELECT COUNT(*) FROM "CardEdition" e WHERE e."athleteId" = a.id AND e.active) AS editions,
        (SELECT COUNT(DISTINCT ci."editionId") FROM "CardInstance" ci JOIN "CardEdition" e ON e.id = ci."editionId"
          WHERE e."athleteId" = a.id AND ci."ownerId" = ${actorId} AND ci."retiredAt" IS NULL) AS owned
      ${from} ORDER BY a.name COLLATE "fr-x-icu" ASC, a.id ASC
      LIMIT ${params.pageSize} OFFSET ${(params.page - 1) * params.pageSize}`,
    client.$queryRaw<{ total: bigint }[]>`SELECT COUNT(*) AS total ${from}`,
  ]);
  return {
    athletes: rows.map((row) => ({ id: row.id, name: row.name, sport: row.sport, nationality: row.nationality,
      prestigeScore: Number(row.prestige), discovered: row.discovered, editions: Number(row.editions), ownedEditions: Number(row.owned) })),
    total: Number(count?.total ?? 0), page: params.page, pageSize: params.pageSize,
  };
}

/** Lists of strings or of { title|name, year? } become readable lines; anything else is ignored. */
function readableEntries(value: Prisma.JsonValue | null): string[] {
  if (Array.isArray(value)) return value.flatMap((entry) => {
    if (typeof entry === "string" && entry.trim()) return [entry.trim()];
    if (entry && typeof entry === "object" && !Array.isArray(entry)) {
      const title = entry.title ?? entry.name;
      if (typeof title !== "string" || !title.trim()) return [];
      return [typeof entry.year === "number" || typeof entry.year === "string" ? `${title.trim()} (${entry.year})` : title.trim()];
    }
    return [];
  });
  if (value && typeof value === "object") return Object.entries(value).flatMap(([key, entry]) =>
    typeof entry === "string" || typeof entry === "number" ? [`${key} : ${typeof entry === "number" ? entry.toLocaleString("fr-FR") : entry}`] : []);
  return [];
}

export async function getAthleteSheet(actorId: string, athleteId: string, client: PrismaClient = db) {
  await assertPlayer(client, actorId);
  if (!athleteId || athleteId.length > 100) throw new ApiError("ATHLETE_NOT_FOUND", "Athlète introuvable.", 404);
  const athlete = await client.athlete.findFirst({ where: { id: athleteId, active: true, sport: { active: true } },
    include: { sport: { select: { id: true, nameFr: true } }, image: true,
      editions: { orderBy: [{ rarity: "asc" }, { releaseDate: "asc" }],
        select: { id: true, name: true, rarity: true, active: true, maxSupply: true, mintedSupply: true, releaseDate: true,
          discoveries: { where: { userId: actorId }, select: { discoveredAt: true } },
          _count: { select: { instances: { where: { ownerId: actorId, retiredAt: null } } } } } } } });
  if (!athlete) throw new ApiError("ATHLETE_NOT_FOUND", "Athlète introuvable.", 404);
  // Retired or inactive editions stay visible to players who own or discovered them.
  const editions = athlete.editions.filter((edition) => edition.active || edition._count.instances > 0 || edition.discoveries.length > 0)
    .map((edition) => ({ id: edition.id, name: edition.name, rarity: edition.rarity as CardRarity, owned: edition._count.instances,
      discovered: edition.discoveries.length > 0, maxSupply: edition.maxSupply,
      soldOut: edition.maxSupply !== null && edition.mintedSupply >= edition.maxSupply, obtainable: edition.active }));
  const unlocked = editions.some((edition) => edition.discovered);
  return {
    id: athlete.id, name: athlete.name, sport: athlete.sport.nameFr, sportId: athlete.sport.id,
    nationality: athlete.nationality, currentTeam: athlete.currentTeam, position: athlete.position,
    prestigeScore: athlete.prestigeOverride ?? athlete.prestigeScore, image: displayableAthleteImage(athlete.image),
    unlocked,
    // Detailed information is revealed once the player has discovered at least one edition.
    details: unlocked ? {
      birthDate: athlete.birthDate?.toISOString().slice(0, 10) ?? null, biography: athlete.biography,
      statistics: readableEntries(athlete.statistics), achievements: readableEntries(athlete.achievements),
    } : null,
    editions,
  };
}
export type AthleteSheet = Awaited<ReturnType<typeof getAthleteSheet>>;
