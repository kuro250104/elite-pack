import "server-only";
import { z } from "zod";
import { db } from "@/lib/db/prisma";
import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import type { CardRarity } from "@/components/cards/athlete-card";
import { ApiError } from "@/lib/api/errors";

/** Integer coins; the upper bound keeps prices readable and far from BigInt limits. */
export const maxListingPrice = 1_000_000_000;
export const createListingSchema = z.object({
  cardInstanceId: z.string().min(1).max(100),
  price: z.number().int("Le prix doit être un nombre entier de pièces.").min(1, "Le prix doit être d’au moins 1 pièce.")
    .max(maxListingPrice, "Le prix est trop élevé."),
}).strict();
const text = z.string().trim().min(1).max(100);
export const marketplaceQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(10000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(24),
  view: z.enum(["all", "mine"]).default("all"),
  sportId: text.optional(), rarity: z.enum(["COMMON", "UNCOMMON", "RARE", "EPIC", "LEGENDARY", "MYTHIC"]).optional(),
  query: text.optional(),
  minPrice: z.coerce.number().int().min(1).max(maxListingPrice).optional(),
  maxPrice: z.coerce.number().int().min(1).max(maxListingPrice).optional(),
  sort: z.enum(["recent", "price-asc", "price-desc"]).default("recent"),
}).strict();
export type MarketplaceQuery = z.infer<typeof marketplaceQuerySchema>;

const lockPlayer = (tx: Prisma.TransactionClient, userId: string) =>
  tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`wallet:user:${userId}`}, 0))`;
const lockListing = (tx: Prisma.TransactionClient, listingId: string) =>
  tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`listing:${listingId}`}, 0))`;
const lockCard = (tx: Prisma.TransactionClient, cardInstanceId: string) =>
  tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`card:${cardInstanceId}`}, 0))`;

function serializeListing(listing: { id: string; cardInstanceId: string; sellerId: string; price: bigint; status: string; createdAt: Date }) {
  return { id: listing.id, cardInstanceId: listing.cardInstanceId, price: String(listing.price), status: listing.status,
    createdAt: listing.createdAt.toISOString() };
}

/** Lists one owned card. Repeating the same request returns the active listing instead of creating a second one. */
export async function createListing(actorId: string, input: unknown, client: PrismaClient = db) {
  const { cardInstanceId, price } = createListingSchema.parse(input);
  return client.$transaction(async (tx) => {
    // Same card lock as the purchase and the bank sale paths, so ownership cannot change underneath.
    await lockCard(tx, cardInstanceId);
    const [card] = await tx.$queryRaw<{ ownerId: string | null; retiredAt: Date | null }[]>`
      SELECT "ownerId", "retiredAt" FROM "CardInstance" WHERE id = ${cardInstanceId} FOR UPDATE`;
    if (!card || card.ownerId !== actorId || card.retiredAt) throw new ApiError("CARD_NOT_OWNED", "Cette carte ne fait pas partie de votre collection.", 404);
    const active = await tx.marketplaceListing.findFirst({ where: { cardInstanceId, status: "ACTIVE" } });
    if (active) {
      if (active.sellerId === actorId && active.price === BigInt(price)) return { listing: serializeListing(active), replay: true };
      throw new ApiError("CARD_ALREADY_LISTED", "Cette carte est déjà en vente. Retirez l’annonce pour changer son prix.", 409);
    }
    const listing = await tx.marketplaceListing.create({ data: { cardInstanceId, sellerId: actorId, price: BigInt(price) } });
    return { listing: serializeListing(listing), replay: false };
  });
}

/** Cancels the seller's own active listing; cancelling twice is a no-op. */
export async function cancelListing(actorId: string, listingId: string, client: PrismaClient = db) {
  const id = text.parse(listingId);
  return client.$transaction(async (tx) => {
    await lockListing(tx, id);
    const listing = await tx.marketplaceListing.findUnique({ where: { id } });
    if (!listing || listing.sellerId !== actorId) throw new ApiError("LISTING_NOT_FOUND", "Annonce introuvable.", 404);
    if (listing.status === "SOLD") throw new ApiError("LISTING_SOLD", "Cette carte a déjà été vendue.", 409);
    if (listing.status === "CANCELLED") return { listing: serializeListing(listing), replay: true };
    const cancelled = await tx.marketplaceListing.update({ where: { id }, data: { status: "CANCELLED", closedAt: new Date() } });
    return { listing: serializeListing(cancelled), replay: false };
  });
}

/**
 * Buys an active listing: debit the buyer, credit the seller, transfer the card and close the listing in one transaction.
 * Locks are always taken in the order listing → card → players (sorted), so concurrent purchases cannot deadlock.
 */
export async function buyListing(actorId: string, listingId: string, idempotencyKey: string, client: PrismaClient = db) {
  const id = text.parse(listingId);
  const key = z.uuid().parse(idempotencyKey);
  return client.$transaction(async (tx) => {
    await lockListing(tx, id);
    const reused = await tx.marketplaceListing.findUnique({ where: { purchaseIdempotencyKey: key } });
    if (reused) {
      if (reused.id !== id || reused.buyerId !== actorId) throw new ApiError("IDEMPOTENCY_CONFLICT", "Cette clé a déjà été utilisée pour une autre opération.", 409);
      const wallet = await tx.wallet.findUniqueOrThrow({ where: { userId: actorId }, select: { balance: true } });
      return { listingId: id, cardInstanceId: reused.cardInstanceId, price: String(reused.price), balance: String(wallet.balance), replay: true };
    }
    const listing = await tx.marketplaceListing.findUnique({ where: { id } });
    if (!listing || listing.status !== "ACTIVE") throw new ApiError("LISTING_UNAVAILABLE", "Cette annonce n’est plus disponible.", 409);
    if (listing.sellerId === actorId) throw new ApiError("OWN_LISTING", "Vous ne pouvez pas acheter votre propre annonce.", 409);
    await lockCard(tx, listing.cardInstanceId);
    for (const userId of [actorId, listing.sellerId].sort()) await lockPlayer(tx, userId);
    const [card] = await tx.$queryRaw<{ ownerId: string | null; retiredAt: Date | null; editionId: string }[]>`
      SELECT "ownerId", "retiredAt", "editionId" FROM "CardInstance" WHERE id = ${listing.cardInstanceId} FOR UPDATE`;
    // Defensive: bank sales refuse listed cards, so a listing whose card left the seller should not exist.
    if (!card || card.ownerId !== listing.sellerId || card.retiredAt) throw new ApiError("LISTING_UNAVAILABLE", "Cette annonce n’est plus disponible.", 409);
    const wallets = await tx.$queryRaw<{ userId: string; balance: bigint }[]>`
      SELECT "userId", balance FROM "Wallet" WHERE "userId" IN (${actorId}, ${listing.sellerId}) ORDER BY "userId" FOR UPDATE`;
    const buyer = wallets.find((wallet) => wallet.userId === actorId);
    const seller = wallets.find((wallet) => wallet.userId === listing.sellerId);
    if (!buyer || !seller) throw new ApiError("WALLET_NOT_FOUND", "Portefeuille introuvable.", 409);
    if (buyer.balance < listing.price) throw new ApiError("INSUFFICIENT_FUNDS", "Votre solde est insuffisant pour cet achat.", 409);
    const buyerBalance = buyer.balance - listing.price;
    const sellerBalance = seller.balance + listing.price;
    const now = new Date();
    await tx.wallet.update({ where: { userId: actorId }, data: { balance: buyerBalance, lifetimeSpending: { increment: listing.price } } });
    await tx.wallet.update({ where: { userId: listing.sellerId }, data: { balance: sellerBalance, lifetimeEarnings: { increment: listing.price } } });
    await tx.walletTransaction.create({ data: { walletId: actorId, type: "MARKETPLACE_PURCHASE", amount: -listing.price,
      balanceAfter: buyerBalance, idempotencyKey: `market-buy:${key}`, referenceId: id } });
    await tx.walletTransaction.create({ data: { walletId: listing.sellerId, type: "MARKETPLACE_SALE", amount: listing.price,
      balanceAfter: sellerBalance, idempotencyKey: `market-sale:${id}`, referenceId: id } });
    await tx.cardInstance.update({ where: { id: listing.cardInstanceId }, data: { ownerId: actorId, acquiredAt: now, acquisitionSource: "MARKETPLACE" } });
    await tx.cardDiscovery.upsert({ where: { userId_editionId: { userId: actorId, editionId: card.editionId } },
      create: { userId: actorId, editionId: card.editionId }, update: {} });
    await tx.marketplaceListing.update({ where: { id }, data: { status: "SOLD", buyerId: actorId, closedAt: now, purchaseIdempotencyKey: key } });
    return { listingId: id, cardInstanceId: listing.cardInstanceId, price: String(listing.price), balance: String(buyerBalance), replay: false };
  });
}

export async function listMarketplace(actorId: string, input: unknown, client: PrismaClient = db) {
  const params = marketplaceQuerySchema.parse(input);
  const clauses = [Prisma.sql`l.status = 'ACTIVE'`];
  if (params.view === "mine") clauses.push(Prisma.sql`l."sellerId" = ${actorId}`);
  if (params.sportId) clauses.push(Prisma.sql`a."sportId" = ${params.sportId}`);
  if (params.rarity) clauses.push(Prisma.sql`e.rarity = ${params.rarity}::"Rarity"`);
  if (params.query) clauses.push(Prisma.sql`a.name ILIKE ${`%${params.query.replace(/[\\%_]/gu, (match) => `\\${match}`)}%`}`);
  if (params.minPrice !== undefined) clauses.push(Prisma.sql`l.price >= ${BigInt(params.minPrice)}`);
  if (params.maxPrice !== undefined) clauses.push(Prisma.sql`l.price <= ${BigInt(params.maxPrice)}`);
  const order = params.sort === "price-asc" ? Prisma.sql`l.price ASC, l."createdAt" DESC`
    : params.sort === "price-desc" ? Prisma.sql`l.price DESC, l."createdAt" DESC` : Prisma.sql`l."createdAt" DESC`;
  const from = Prisma.sql`FROM "MarketplaceListing" l JOIN "CardInstance" ci ON ci.id = l."cardInstanceId"
    JOIN "CardEdition" e ON e.id = ci."editionId" JOIN "Athlete" a ON a.id = e."athleteId" JOIN "Sport" s ON s.id = a."sportId"
    JOIN "User" u ON u.id = l."sellerId" WHERE ${Prisma.join(clauses, " AND ")}`;
  const [rows, [count]] = await Promise.all([
    client.$queryRaw<{ id: string; price: bigint; createdAt: Date; sellerId: string; seller: string | null; cardInstanceId: string;
      athleteId: string; editionId: string; name: string; sport: string; rarity: CardRarity; editionName: string; nationality: string | null;
      prestige: number; serialNumber: number | null; maxSupply: number | null; baseValue: bigint }[]>`
      SELECT l.id, l.price, l."createdAt", l."sellerId", u.name AS seller, ci.id AS "cardInstanceId", e.id AS "editionId", a.id AS "athleteId", a.name,
        s."nameFr" AS sport, e.rarity::text AS rarity, e.name AS "editionName", a.nationality,
        COALESCE(a."prestigeOverride", a."prestigeScore") AS prestige, ci."serialNumber", e."maxSupply", e."baseValue"
      ${from} ORDER BY ${order}, l.id DESC LIMIT ${params.pageSize} OFFSET ${(params.page - 1) * params.pageSize}`,
    client.$queryRaw<{ total: bigint }[]>`SELECT COUNT(*) AS total ${from}`,
  ]);
  return {
    listings: rows.map((row) => ({ id: row.id, price: String(row.price), createdAt: row.createdAt.toISOString(),
      seller: row.seller ?? "Joueur anonyme", mine: row.sellerId === actorId, baseValue: String(row.baseValue),
      card: { instanceId: row.cardInstanceId, editionId: row.editionId, athleteId: row.athleteId, name: row.name, sport: row.sport, rarity: row.rarity,
        editionName: row.editionName, nationality: row.nationality, prestigeScore: Number(row.prestige),
        serialNumber: row.serialNumber, maxSupply: row.maxSupply } })),
    total: Number(count?.total ?? 0), page: params.page, pageSize: params.pageSize,
  };
}

/** The player's closed sales and purchases, most recent first. */
export async function marketplaceHistory(actorId: string, client: PrismaClient = db) {
  const rows = await client.marketplaceListing.findMany({
    where: { status: "SOLD", OR: [{ sellerId: actorId }, { buyerId: actorId }] }, orderBy: [{ closedAt: "desc" }, { id: "desc" }], take: 50,
    select: { id: true, price: true, closedAt: true, sellerId: true,
      card: { select: { edition: { select: { name: true, rarity: true, athlete: { select: { name: true } } } } } } } });
  return rows.map((row) => ({ id: row.id, price: String(row.price), closedAt: row.closedAt!.toISOString(),
    direction: row.sellerId === actorId ? "sale" as const : "purchase" as const,
    athlete: row.card.edition.athlete.name, editionName: row.card.edition.name, rarity: row.card.edition.rarity as CardRarity }));
}
