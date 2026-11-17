import "server-only";
import { z } from "zod";
import { db } from "@/lib/db/prisma";
import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import type { CardRarity, CardView } from "@/components/cards/athlete-card";
import { ApiError } from "@/lib/api/errors";

const rarity = z.enum(["COMMON", "UNCOMMON", "RARE", "EPIC", "LEGENDARY", "MYTHIC"]);
const text = z.string().trim().min(1).max(100);
export const collectionQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(10000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(24),
  status: z.enum(["owned", "missing"]).default("owned"),
  sportId: text.optional(), rarity: rarity.optional(), query: text.optional(),
  country: text.optional(), team: text.optional(),
  sort: z.enum(["recent", "name", "rarity", "prestige", "value"]).default("recent"),
}).strict();
export type CollectionQuery = z.infer<typeof collectionQuerySchema>;

/** Edition the player does not currently own; details stay hidden until it has been discovered once. */
export type MissingCardView = {
  editionId: string; athleteId: string; name: string; sport: string; rarity: CardRarity; editionName: string;
  discovered: boolean; nationality: string | null; prestigeScore: number | null; maxSupply: number | null;
};

const prestige = Prisma.sql`COALESCE(a."prestigeOverride", a."prestigeScore")`;
// French alphabetical order (accents next to their base letter), whatever the database default collation.
const byName = Prisma.sql`a.name COLLATE "fr-x-icu" ASC`;
const owns = (actorId: string) => Prisma.sql`EXISTS (SELECT 1 FROM "CardInstance" o
  WHERE o."editionId" = e.id AND o."ownerId" = ${actorId} AND o."retiredAt" IS NULL)`;
// Editions a player can still obtain: active edition, athlete and sport.
const obtainable = Prisma.sql`e.active AND a.active AND s.active`;

function filters(params: CollectionQuery) {
  const clauses: Prisma.Sql[] = [];
  if (params.sportId) clauses.push(Prisma.sql`a."sportId" = ${params.sportId}`);
  if (params.rarity) clauses.push(Prisma.sql`e.rarity = ${params.rarity}::"Rarity"`);
  if (params.query) clauses.push(Prisma.sql`a.name ILIKE ${`%${escapeLike(params.query)}%`}`);
  if (params.country) clauses.push(Prisma.sql`a.nationality = ${params.country}`);
  if (params.team) clauses.push(Prisma.sql`a."currentTeam" = ${params.team}`);
  return clauses;
}
function escapeLike(value: string) { return value.replace(/[\\%_]/gu, (match) => `\\${match}`); }
function where(clauses: Prisma.Sql[]) { return Prisma.join(clauses, " AND "); }
function orderBy(sort: CollectionQuery["sort"], recent: Prisma.Sql) {
  // Rarity enum values are declared from COMMON to MYTHIC, so DESC lists the rarest first.
  switch (sort) {
    case "name": return Prisma.sql`${byName}, e.name COLLATE "fr-x-icu" ASC`;
    case "rarity": return Prisma.sql`e.rarity DESC, ${byName}`;
    case "prestige": return Prisma.sql`${prestige} DESC, ${byName}`;
    case "value": return Prisma.sql`e."baseValue" DESC, ${byName}`;
    default: return recent;
  }
}
async function assertPlayer(client: PrismaClient, actorId: string) {
  if (!await client.user.findUnique({ where: { id: actorId }, select: { id: true } }))
    throw new ApiError("UNAUTHENTICATED", "Veuillez vous connecter.", 401);
}

export async function listCollection(actorId: string, input: unknown, client: PrismaClient = db) {
  const params = collectionQuerySchema.parse(input);
  await assertPlayer(client, actorId);
  return params.status === "missing" ? listMissing(actorId, params, client) : listOwned(actorId, params, client);
}

async function listOwned(actorId: string, params: CollectionQuery, client: PrismaClient) {
  const condition = where([Prisma.sql`ci."ownerId" = ${actorId}`, Prisma.sql`ci."retiredAt" IS NULL`, ...filters(params)]);
  const from = Prisma.sql`FROM "CardInstance" ci JOIN "CardEdition" e ON e.id = ci."editionId"
    JOIN "Athlete" a ON a.id = e."athleteId" WHERE ${condition}`;
  const [rows, [count]] = await Promise.all([
    client.$queryRaw<{ id: string }[]>`SELECT ci.id ${from}
      ORDER BY ${orderBy(params.sort, Prisma.sql`ci."acquiredAt" DESC`)}, ci.id DESC
      LIMIT ${params.pageSize} OFFSET ${(params.page - 1) * params.pageSize}`,
    client.$queryRaw<{ total: bigint }[]>`SELECT COUNT(*) AS total ${from}`,
  ]);
  const instances = await client.cardInstance.findMany({ where: { id: { in: rows.map((row) => row.id) } },
    include: { edition: { include: { athlete: { include: { sport: true } } } } } });
  const byId = new Map(instances.map((instance) => [instance.id, instance]));
  const ordered = rows.flatMap((row) => byId.get(row.id) ?? []);
  const duplicates = await client.cardInstance.groupBy({ by: ["editionId"], _count: { _all: true },
    where: { ownerId: actorId, retiredAt: null, editionId: { in: ordered.map((card) => card.editionId) } } });
  const cards: CardView[] = ordered.map((card) => ({
    instanceId: card.id, editionId: card.editionId, athleteId: card.edition.athleteId, name: card.edition.athlete.name,
    sport: card.edition.athlete.sport.nameFr, rarity: card.edition.rarity, editionName: card.edition.name,
    nationality: card.edition.athlete.nationality,
    prestigeScore: card.edition.athlete.prestigeOverride ?? card.edition.athlete.prestigeScore,
    serialNumber: card.serialNumber, maxSupply: card.edition.maxSupply, acquiredAt: card.acquiredAt.toISOString(),
  }));
  return { status: "owned" as const, cards, missing: [] as MissingCardView[], total: Number(count?.total ?? 0),
    page: params.page, pageSize: params.pageSize,
    duplicates: Object.fromEntries(duplicates.map((group) => [group.editionId, group._count._all])) as Record<string, number> };
}

async function listMissing(actorId: string, params: CollectionQuery, client: PrismaClient) {
  const condition = where([obtainable, Prisma.sql`NOT ${owns(actorId)}`, ...filters(params)]);
  const from = Prisma.sql`FROM "CardEdition" e JOIN "Athlete" a ON a.id = e."athleteId"
    JOIN "Sport" s ON s.id = a."sportId" WHERE ${condition}`;
  const [rows, [count]] = await Promise.all([
    client.$queryRaw<{ editionId: string; athleteId: string; name: string; sport: string; rarity: CardRarity;
      editionName: string; nationality: string | null; prestige: number; maxSupply: number | null; discovered: boolean }[]>`
      SELECT e.id AS "editionId", a.id AS "athleteId", a.name, s."nameFr" AS sport, e.rarity::text AS rarity,
        e.name AS "editionName", a.nationality, ${prestige} AS prestige, e."maxSupply",
        EXISTS (SELECT 1 FROM "CardDiscovery" d WHERE d."editionId" = e.id AND d."userId" = ${actorId}) AS discovered
      ${from} ORDER BY ${orderBy(params.sort, Prisma.sql`e."releaseDate" DESC`)}, e.id DESC
      LIMIT ${params.pageSize} OFFSET ${(params.page - 1) * params.pageSize}`,
    client.$queryRaw<{ total: bigint }[]>`SELECT COUNT(*) AS total ${from}`,
  ]);
  const missing: MissingCardView[] = rows.map((row) => ({
    editionId: row.editionId, athleteId: row.athleteId, name: row.name, sport: row.sport, rarity: row.rarity,
    editionName: row.editionName, discovered: row.discovered, maxSupply: row.maxSupply,
    nationality: row.discovered ? row.nationality : null, prestigeScore: row.discovered ? Number(row.prestige) : null,
  }));
  return { status: "missing" as const, cards: [] as CardView[], missing, total: Number(count?.total ?? 0),
    page: params.page, pageSize: params.pageSize, duplicates: {} as Record<string, number> };
}

/** Distinct obtainable editions owned per active sport, for the progress bars. */
export async function collectionProgress(actorId: string, client: PrismaClient = db) {
  await assertPlayer(client, actorId);
  const rows = await client.$queryRaw<{ sportId: string; sport: string; owned: bigint; total: bigint }[]>`
    SELECT s.id AS "sportId", s."nameFr" AS sport, COUNT(*) AS total, COUNT(*) FILTER (WHERE ${owns(actorId)}) AS owned
    FROM "CardEdition" e JOIN "Athlete" a ON a.id = e."athleteId" JOIN "Sport" s ON s.id = a."sportId"
    WHERE ${obtainable} GROUP BY s.id, s."nameFr" ORDER BY s."nameFr" ASC`;
  const sports = rows.map((row) => ({ sportId: row.sportId, sport: row.sport, owned: Number(row.owned), total: Number(row.total) }));
  return { sports, owned: sports.reduce((sum, row) => sum + row.owned, 0), total: sports.reduce((sum, row) => sum + row.total, 0) };
}

/** Countries and teams present in the player's cards, to fill the filter menus. */
export async function collectionFacets(actorId: string, client: PrismaClient = db) {
  await assertPlayer(client, actorId);
  const rows = await client.$queryRaw<{ nationality: string | null; team: string | null }[]>`
    SELECT DISTINCT a.nationality, a."currentTeam" AS team FROM "CardInstance" ci
    JOIN "CardEdition" e ON e.id = ci."editionId" JOIN "Athlete" a ON a.id = e."athleteId"
    WHERE ci."ownerId" = ${actorId} AND ci."retiredAt" IS NULL`;
  const sorted = (values: (string | null)[]) => [...new Set(values.filter((value): value is string => Boolean(value)))]
    .sort((left, right) => left.localeCompare(right, "fr"));
  return { countries: sorted(rows.map((row) => row.nationality)), teams: sorted(rows.map((row) => row.team)) };
}
