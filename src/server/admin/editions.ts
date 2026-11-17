import "server-only";
import { z } from "zod";
import { db } from "@/lib/db/prisma";
import type { Prisma, PrismaClient, Rarity } from "@/generated/prisma/client";
import { ApiError } from "@/lib/api/errors";
import { calendarDateSchema } from "@/server/athletes/validation";
import { assertAdminActor } from "@/server/sports/service";
import { revalueEditions } from "@/server/economy/valuation";

const rarity = z.enum(["COMMON", "UNCOMMON", "RARE", "EPIC", "LEGENDARY", "MYTHIC"]);
const name = z.string().trim().min(1, "Indiquez le nom de l’édition.").max(80, "Le nom est trop long.");
const maxSupply = z.number().int("Le tirage doit être un nombre entier.").min(1, "Le tirage limité doit être d’au moins 1.").max(1_000_000, "Le tirage est trop élevé.").nullable();
export const editionCreateSchema = z.object({
  athleteId: z.string().min(1).max(100), name, rarity, maxSupply, active: z.boolean().default(false),
  releaseDate: calendarDateSchema.optional(), addToBoosters: z.boolean().default(true),
}).strict();
export const editionPatchSchema = z.object({
  name: name.optional(), rarity: rarity.optional(), maxSupply: maxSupply.optional(), active: z.boolean().optional(),
  releaseDate: calendarDateSchema.optional(),
}).strict().refine((value) => Object.keys(value).length > 0, "Indiquez au moins un champ à modifier.");
const text = z.string().trim().min(1).max(100);
export const editionQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(10000).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(30),
  query: text.optional(), rarity: rarity.optional(), athleteId: text.optional(),
}).strict();

const snapshot = (edition: { name: string; rarity: Rarity; maxSupply: number | null; active: boolean; releaseDate: Date }) =>
  ({ name: edition.name, rarity: edition.rarity, maxSupply: edition.maxSupply, active: edition.active, releaseDate: edition.releaseDate.toISOString().slice(0, 10) });

/**
 * Creates an edition; its value follows the rarity and athlete prestige. With addToBoosters, it joins every booster that
 * lists its editions explicitly and covers the athlete's sport (boosters without a list already include it).
 */
export async function createEdition(tx: Prisma.TransactionClient, actorId: string, input: unknown) {
  await assertAdminActor(tx, actorId);
  const data = editionCreateSchema.parse(input);
  const athlete = await tx.athlete.findUnique({ where: { id: data.athleteId }, select: { id: true, sportId: true } });
  if (!athlete) throw new ApiError("NOT_FOUND", "Cet athlète est introuvable.", 404);
  const edition = await tx.cardEdition.create({ data: { athleteId: athlete.id, name: data.name, rarity: data.rarity, maxSupply: data.maxSupply,
    active: data.active, ...(data.releaseDate ? { releaseDate: new Date(`${data.releaseDate}T00:00:00Z`) } : {}) } });
  await revalueEditions(tx, { athleteId: athlete.id });
  const boosters = data.addToBoosters ? await tx.boosterType.findMany({ where: { editions: { some: {} },
    OR: [{ sports: { none: {} } }, { sports: { some: { sportId: athlete.sportId } } }] }, select: { id: true } }) : [];
  for (const booster of boosters) await tx.boosterEdition.create({ data: { boosterTypeId: booster.id, editionId: edition.id } });
  await tx.adminAuditLog.create({ data: { actorId, action: "EDITION_CREATE", entityType: "CardEdition", entityId: edition.id,
    after: { ...snapshot(edition), athleteId: athlete.id, boosters: boosters.map((booster) => booster.id) } } });
  return { id: edition.id, boosters: boosters.length };
}

/**
 * Minted editions keep their rarity and supply mode: collectors' cards and serial numbers stay consistent.
 * A limited supply can never go below the number already minted.
 */
export async function updateEdition(tx: Prisma.TransactionClient, actorId: string, editionId: string, input: unknown) {
  await assertAdminActor(tx, actorId);
  const patch = editionPatchSchema.parse(input);
  await tx.$queryRaw`SELECT id FROM "CardEdition" WHERE id = ${editionId} FOR UPDATE`;
  const before = await tx.cardEdition.findUnique({ where: { id: editionId } });
  if (!before) throw new ApiError("NOT_FOUND", "Cette édition est introuvable.", 404);
  if (before.mintedSupply > 0 && patch.rarity !== undefined && patch.rarity !== before.rarity)
    throw new ApiError("EDITION_MINTED", "La rareté ne peut plus changer : des exemplaires ont déjà été frappés.", 409);
  if (patch.maxSupply !== undefined) {
    if (before.mintedSupply > 0 && (patch.maxSupply === null) !== (before.maxSupply === null))
      throw new ApiError("SUPPLY_MODE_LOCKED", "Le passage entre tirage limité et illimité est impossible après la première frappe.", 409);
    if (patch.maxSupply !== null && patch.maxSupply < before.mintedSupply)
      throw new ApiError("SUPPLY_BELOW_MINTED", `Le tirage ne peut pas être inférieur aux ${before.mintedSupply} exemplaires déjà frappés.`, 409);
  }
  const updated = await tx.cardEdition.update({ where: { id: editionId }, data: { ...patch,
    ...(patch.releaseDate ? { releaseDate: new Date(`${patch.releaseDate}T00:00:00Z`) } : {}) } });
  if (patch.rarity !== undefined && patch.rarity !== before.rarity) await revalueEditions(tx, { athleteId: before.athleteId });
  await tx.adminAuditLog.create({ data: { actorId, action: "EDITION_UPDATE", entityType: "CardEdition", entityId: editionId,
    before: snapshot(before), after: snapshot(updated) } });
  return { id: updated.id, ...snapshot(updated), mintedSupply: updated.mintedSupply };
}

export async function listAdminEditions(input: unknown, client: PrismaClient = db) {
  const params = editionQuerySchema.parse(input);
  const where: Prisma.CardEditionWhereInput = { ...(params.rarity ? { rarity: params.rarity } : {}),
    ...(params.athleteId ? { athleteId: params.athleteId } : {}),
    ...(params.query ? { OR: [{ name: { contains: params.query, mode: "insensitive" } }, { athlete: { name: { contains: params.query, mode: "insensitive" } } }] } : {}) };
  const [editions, total] = await Promise.all([
    client.cardEdition.findMany({ where, orderBy: [{ athlete: { name: "asc" } }, { rarity: "asc" }, { id: "asc" }],
      take: params.pageSize, skip: (params.page - 1) * params.pageSize,
      include: { athlete: { select: { name: true, sport: { select: { nameFr: true } } } }, _count: { select: { boosterEditions: true } } } }),
    client.cardEdition.count({ where }),
  ]);
  return { total, page: params.page, pageSize: params.pageSize, editions: editions.map((edition) => ({
    id: edition.id, athleteId: edition.athleteId, athlete: edition.athlete.name, sport: edition.athlete.sport.nameFr, ...snapshot(edition),
    mintedSupply: edition.mintedSupply, baseValue: String(edition.baseValue), boosters: edition._count.boosterEditions })) };
}
