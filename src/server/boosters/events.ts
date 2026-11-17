import "server-only";
import { z } from "zod";
import { db } from "@/lib/db/prisma";
import type { Prisma, PrismaClient, Rarity } from "@/generated/prisma/client";
import { ApiError } from "@/lib/api/errors";
import { assertAdminActor } from "@/server/sports/service";
import { openingRarities, validateOpeningWeights } from "./opening";

/** Default probabilities of a new event, editable afterwards like any booster. */
const defaultWeights: Record<Rarity, number> = { COMMON: 5500, UNCOMMON: 2500, RARE: 1200, EPIC: 500, LEGENDARY: 250, MYTHIC: 50 };

const instant = z.iso.datetime({ offset: true, message: "Indiquez une date et une heure valides." });
const eventFields = {
  nameFr: z.string().trim().min(2, "Indiquez le nom de l’événement.").max(80, "Le nom est trop long."),
  startsAt: instant, endsAt: instant,
  price: z.number().int("Le prix doit être un nombre entier de pièces.").min(0, "Le prix ne peut pas être négatif.").max(1_000_000, "Le prix est trop élevé."),
  cardCount: z.number().int().min(1, "Un booster contient au moins une carte.").max(50, "Un booster contient au plus 50 cartes."),
  maxPerPlayer: z.number().int().min(1, "La limite doit être d’au moins 1.").max(1000).nullable(),
  sportIds: z.array(z.string().min(1).max(100)).max(50),
  // Editions restrict the pool explicitly; season/competition filters are not exposed because editions cannot be tagged yet.
  editionIds: z.array(z.string().min(1).max(100)).max(500),
};
const datesInOrder = (value: { startsAt?: string; endsAt?: string }) => !value.startsAt || !value.endsAt || new Date(value.startsAt) < new Date(value.endsAt);
export const eventCreateSchema = z.object(eventFields).strict()
  .refine((value) => new Date(value.startsAt) < new Date(value.endsAt), { message: "La fin doit suivre le début.", path: ["endsAt"] });
export const eventPatchSchema = z.object({ ...eventFields, active: z.boolean() }).partial().strict()
  .refine((value) => Object.keys(value).length > 0, "Indiquez au moins un champ à modifier.").refine(datesInOrder, { message: "La fin doit suivre le début.", path: ["endsAt"] });

async function now(client: PrismaClient | Prisma.TransactionClient) {
  const [clock] = await client.$queryRaw<{ now: Date }[]>`SELECT clock_timestamp() AS now`;
  return clock!.now;
}

/** Ongoing and upcoming active events, with what this player already bought and still holds. */
export async function listEvents(actorId: string, client: PrismaClient = db) {
  const at = await now(client);
  const events = await client.boosterType.findMany({ where: { category: "EVENT", active: true, OR: [{ endsAt: null }, { endsAt: { gt: at } }] },
    orderBy: [{ startsAt: "asc" }, { id: "asc" }],
    include: { weights: true, sports: { include: { sport: { select: { id: true, nameFr: true, active: true } } } }, _count: { select: { editions: true } },
      inventory: { where: { userId: actorId }, select: { quantity: true } } } });
  const purchases = await client.walletTransaction.groupBy({ by: ["referenceId"], _count: { _all: true },
    where: { walletId: actorId, type: "BOOSTER_PURCHASE", referenceId: { in: events.map((event) => event.id) } } });
  const bought = new Map(purchases.map((row) => [row.referenceId, row._count._all]));
  return { serverTime: at.toISOString(), events: events.map((event) => ({
    id: event.id, nameFr: event.nameFr, price: String(event.price), cardCount: event.cardCount, maxPerPlayer: event.maxPerPlayer,
    startsAt: event.startsAt?.toISOString() ?? null, endsAt: event.endsAt?.toISOString() ?? null,
    status: event.startsAt && event.startsAt > at ? "upcoming" as const : "ongoing" as const,
    season: event.season, competition: event.competition, restrictedEditions: event._count.editions,
    sports: event.sports.filter((row) => row.sport.active).map((row) => ({ id: row.sport.id, nameFr: row.sport.nameFr })),
    weights: Object.fromEntries(openingRarities.map((rarity) => [rarity, event.weights.find((weight) => weight.rarity === rarity)?.weightBasisPoints ?? 0])) as Record<Rarity, number>,
    purchased: bought.get(event.id) ?? 0, available: event.inventory[0]?.quantity ?? 0,
  })) };
}

/**
 * Buys (or claims, when free) one event booster: debit, ledger BOOSTER_PURCHASE and inventory in one transaction.
 * Only during the event, within the per-player limit; the idempotency key prevents a double debit.
 */
export async function purchaseEventBooster(actorId: string, boosterTypeId: string, idempotencyKey: string, client: PrismaClient = db) {
  const id = z.string().min(1).max(100).parse(boosterTypeId);
  const key = z.uuid().parse(idempotencyKey);
  return client.$transaction(async (tx) => {
    // Same per-player lock as bank sales and marketplace purchases: one wallet operation at a time.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`wallet:user:${actorId}`}, 0))`;
    const [wallet] = await tx.$queryRaw<{ balance: bigint }[]>`SELECT balance FROM "Wallet" WHERE "userId" = ${actorId} FOR UPDATE`;
    if (!wallet) throw new ApiError("WALLET_NOT_FOUND", "Votre portefeuille est introuvable.", 409);
    const previous = await tx.walletTransaction.findUnique({ where: { walletId_idempotencyKey: { walletId: actorId, idempotencyKey: `booster-purchase:${key}` } } });
    if (previous) {
      if (previous.referenceId !== id) throw new ApiError("IDEMPOTENCY_CONFLICT", "Cette clé a déjà été utilisée pour une autre opération.", 409);
      const inventory = await tx.boosterInventory.findUnique({ where: { userId_boosterTypeId: { userId: actorId, boosterTypeId: id } } });
      return { boosterTypeId: id, available: inventory?.quantity ?? 0, balance: String(previous.balanceAfter), replay: true };
    }
    await tx.$queryRaw`SELECT id FROM "BoosterType" WHERE id = ${id} FOR SHARE`;
    const event = await tx.boosterType.findUnique({ where: { id }, include: { weights: true } });
    const at = await now(tx);
    if (!event || event.category !== "EVENT" || !event.active || (event.startsAt && event.startsAt > at) || (event.endsAt && event.endsAt <= at))
      throw new ApiError("EVENT_UNAVAILABLE", "Cet événement n’est pas en cours.", 409);
    validateOpeningWeights(event.weights, event.cardCount);
    if (event.maxPerPlayer !== null) {
      const purchased = await tx.walletTransaction.count({ where: { walletId: actorId, type: "BOOSTER_PURCHASE", referenceId: id } });
      if (purchased >= event.maxPerPlayer) throw new ApiError("EVENT_LIMIT_REACHED", `Limite atteinte : ${event.maxPerPlayer} booster${event.maxPerPlayer > 1 ? "s" : ""} par joueur pour cet événement.`, 409);
    }
    if (wallet.balance < event.price) throw new ApiError("INSUFFICIENT_FUNDS", "Votre solde est insuffisant pour ce booster.", 409);
    const balance = wallet.balance - event.price;
    if (event.price > BigInt(0)) await tx.wallet.update({ where: { userId: actorId }, data: { balance, lifetimeSpending: { increment: event.price } } });
    // Free events are recorded too (amount 0): the ledger is what enforces the per-player limit.
    await tx.walletTransaction.create({ data: { walletId: actorId, type: "BOOSTER_PURCHASE", amount: -event.price, balanceAfter: balance,
      idempotencyKey: `booster-purchase:${key}`, referenceId: id } });
    const inventory = await tx.boosterInventory.upsert({ where: { userId_boosterTypeId: { userId: actorId, boosterTypeId: id } },
      create: { userId: actorId, boosterTypeId: id, quantity: 1 }, update: { quantity: { increment: 1 } } });
    return { boosterTypeId: id, available: inventory.quantity, balance: String(balance), replay: false };
  });
}

async function replaceEligibility(tx: Prisma.TransactionClient, boosterTypeId: string, sportIds?: string[], editionIds?: string[]) {
  if (sportIds) {
    const found = await tx.sport.count({ where: { id: { in: sportIds } } });
    if (found !== new Set(sportIds).size) throw new ApiError("INVALID_SPORTS", "Un des sports sélectionnés est introuvable.", 400);
    await tx.boosterSport.deleteMany({ where: { boosterTypeId } });
    for (const sportId of new Set(sportIds)) await tx.boosterSport.create({ data: { boosterTypeId, sportId } });
  }
  if (editionIds) {
    const found = await tx.cardEdition.count({ where: { id: { in: editionIds } } });
    if (found !== new Set(editionIds).size) throw new ApiError("INVALID_EDITIONS", "Une des éditions sélectionnées est introuvable.", 400);
    await tx.boosterEdition.deleteMany({ where: { boosterTypeId } });
    for (const editionId of new Set(editionIds)) await tx.boosterEdition.create({ data: { boosterTypeId, editionId } });
  }
}

/** Creates an inactive event: the administrator checks probabilities and pool, then activates it. */
export async function createEvent(tx: Prisma.TransactionClient, actorId: string, input: unknown) {
  await assertAdminActor(tx, actorId);
  const data = eventCreateSchema.parse(input);
  const event = await tx.boosterType.create({ data: { slug: `evenement-${crypto.randomUUID()}`, nameFr: data.nameFr, category: "EVENT", active: false,
    startsAt: new Date(data.startsAt), endsAt: new Date(data.endsAt), price: BigInt(data.price), cardCount: data.cardCount,
    maxPerPlayer: data.maxPerPlayer,
    weights: { create: openingRarities.map((rarity) => ({ rarity, weightBasisPoints: defaultWeights[rarity] })) } } });
  await replaceEligibility(tx, event.id, data.sportIds, data.editionIds);
  await tx.adminAuditLog.create({ data: { actorId, action: "EVENT_CREATE", entityType: "BoosterType", entityId: event.id, after: data } });
  return { id: event.id };
}

export async function updateEvent(tx: Prisma.TransactionClient, actorId: string, eventId: string, input: unknown) {
  await assertAdminActor(tx, actorId);
  const patch = eventPatchSchema.parse(input);
  await tx.$queryRaw`SELECT id FROM "BoosterType" WHERE id = ${eventId} FOR UPDATE`;
  const before = await tx.boosterType.findUnique({ where: { id: eventId } });
  if (!before || before.category !== "EVENT") throw new ApiError("NOT_FOUND", "Cet événement est introuvable.", 404);
  const startsAt = patch.startsAt ? new Date(patch.startsAt) : before.startsAt;
  const endsAt = patch.endsAt ? new Date(patch.endsAt) : before.endsAt;
  if (startsAt && endsAt && startsAt >= endsAt) throw new ApiError("INVALID_DATES", "La fin doit suivre le début.", 400);
  const { sportIds, editionIds, price, startsAt: _starts, endsAt: _ends, ...scalars } = patch;
  void _starts; void _ends;
  await tx.boosterType.update({ where: { id: eventId }, data: { ...scalars, startsAt, endsAt, ...(price !== undefined ? { price: BigInt(price) } : {}) } });
  await replaceEligibility(tx, eventId, sportIds, editionIds);
  await tx.adminAuditLog.create({ data: { actorId, action: "EVENT_UPDATE", entityType: "BoosterType", entityId: eventId,
    before: { nameFr: before.nameFr, active: before.active, startsAt: before.startsAt?.toISOString() ?? null, endsAt: before.endsAt?.toISOString() ?? null,
      price: String(before.price), maxPerPlayer: before.maxPerPlayer }, after: patch } });
  return { id: eventId };
}

export async function listAdminEvents(client: PrismaClient = db) {
  const events = await client.boosterType.findMany({ where: { category: "EVENT" }, orderBy: [{ startsAt: "desc" }, { id: "asc" }],
    include: { sports: { select: { sportId: true } }, editions: { select: { editionId: true } } } });
  const sales = await client.walletTransaction.groupBy({ by: ["referenceId"], _count: { _all: true },
    where: { type: "BOOSTER_PURCHASE", referenceId: { in: events.map((event) => event.id) } } });
  const sold = new Map(sales.map((row) => [row.referenceId, row._count._all]));
  return events.map((event) => ({ id: event.id, nameFr: event.nameFr, active: event.active, price: Number(event.price), cardCount: event.cardCount,
    maxPerPlayer: event.maxPerPlayer, startsAt: event.startsAt?.toISOString() ?? null, endsAt: event.endsAt?.toISOString() ?? null,
    season: event.season, competition: event.competition, sportIds: event.sports.map((row) => row.sportId),
    editionIds: event.editions.map((row) => row.editionId), sold: sold.get(event.id) ?? 0 }));
}
