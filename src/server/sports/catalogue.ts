import "server-only";
import { db } from "@/lib/db/prisma";
import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import { ApiError } from "@/lib/api/errors";

type Row = { id: string; slug: string; nameFr: string; category: string | null; icon: string | null;
  athletes: bigint; editions: bigint; owned: bigint; minted: bigint };

/**
 * Active sports with their playable content. "editions" counts obtainable editions (active edition and athlete), the same
 * rule as the collection progress; "owned" is the player's distinct editions currently held; "minted" every card ever minted.
 */
async function sportRows(actorId: string, client: PrismaClient, sportId?: string) {
  const filter = sportId ? Prisma.sql`AND s.id = ${sportId}` : Prisma.empty;
  return client.$queryRaw<Row[]>`
    SELECT s.id, s.slug, s."nameFr", s.category, s.icon,
      (SELECT COUNT(*) FROM "Athlete" a WHERE a."sportId" = s.id AND a.active) AS athletes,
      (SELECT COUNT(*) FROM "CardEdition" e JOIN "Athlete" a ON a.id = e."athleteId" WHERE a."sportId" = s.id AND a.active AND e.active) AS editions,
      (SELECT COUNT(DISTINCT e.id) FROM "CardEdition" e JOIN "Athlete" a ON a.id = e."athleteId"
        WHERE a."sportId" = s.id AND a.active AND e.active AND EXISTS (SELECT 1 FROM "CardInstance" ci
          WHERE ci."editionId" = e.id AND ci."ownerId" = ${actorId} AND ci."retiredAt" IS NULL)) AS owned,
      (SELECT COALESCE(SUM(e."mintedSupply"), 0) FROM "CardEdition" e JOIN "Athlete" a ON a.id = e."athleteId" WHERE a."sportId" = s.id) AS minted
    FROM "Sport" s WHERE s.active ${filter} ORDER BY s."nameFr" COLLATE "fr-x-icu" ASC`;
}
const serialize = (row: Row) => ({ id: row.id, slug: row.slug, nameFr: row.nameFr, category: row.category, icon: row.icon,
  athletes: Number(row.athletes), editions: Number(row.editions), owned: Number(row.owned), minted: Number(row.minted) });

export async function listSportsCatalogue(actorId: string, client: PrismaClient = db) {
  return (await sportRows(actorId, client)).map(serialize);
}

/** One active sport with its most prestigious athletes; inactive or unknown sports are not disclosed. */
export async function getSportDetail(actorId: string, sportId: string, client: PrismaClient = db) {
  if (!sportId || sportId.length > 100) throw new ApiError("SPORT_NOT_FOUND", "Ce sport est introuvable.", 404);
  const [row] = await sportRows(actorId, client, sportId);
  if (!row) throw new ApiError("SPORT_NOT_FOUND", "Ce sport est introuvable.", 404);
  const athletes = await client.$queryRaw<{ id: string; name: string; prestige: number }[]>`
    SELECT a.id, a.name, COALESCE(a."prestigeOverride", a."prestigeScore") AS prestige FROM "Athlete" a
    WHERE a."sportId" = ${sportId} AND a.active ORDER BY prestige DESC, a.name COLLATE "fr-x-icu" ASC LIMIT 10`;
  return { ...serialize(row), topAthletes: athletes.map((athlete) => ({ ...athlete, prestige: Number(athlete.prestige) })) };
}
