import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { buyListing, cancelListing, createListing, listMarketplace, marketplaceHistory } from "@/server/marketplace/service";
import { sellToBank } from "@/server/economy/bank";
import { afterAll, afterEach, describe, expect, it } from "vitest";

const connectionString = process.env.TEST_DATABASE_URL;
if (!connectionString) throw new Error("TEST_DATABASE_URL est obligatoire pour le marché.");
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
afterAll(async () => prisma.$disconnect());

// Purchases commit their own transactions (concurrency is part of the contract), so fixtures are cleaned explicitly.
const created: { users: string[]; sports: string[] } = { users: [], sports: [] };
afterEach(async () => {
  await prisma.$transaction(async (tx) => {
    const athletes = (await tx.athlete.findMany({ where: { sportId: { in: created.sports } }, select: { id: true } })).map((row) => row.id);
    const editions = (await tx.cardEdition.findMany({ where: { athleteId: { in: athletes } }, select: { id: true } })).map((row) => row.id);
    await tx.marketplaceListing.deleteMany({ where: { card: { editionId: { in: editions } } } });
    await tx.cardInstance.deleteMany({ where: { editionId: { in: editions } } });
    await tx.cardDiscovery.deleteMany({ where: { editionId: { in: editions } } });
    await tx.cardEdition.deleteMany({ where: { id: { in: editions } } });
    await tx.athlete.deleteMany({ where: { id: { in: athletes } } });
    await tx.sport.deleteMany({ where: { id: { in: created.sports } } });
    await tx.walletTransaction.deleteMany({ where: { walletId: { in: created.users } } });
    await tx.wallet.deleteMany({ where: { userId: { in: created.users } } });
    await tx.user.deleteMany({ where: { id: { in: created.users } } });
  });
  created.users = []; created.sports = [];
});

async function player(balance: number, name = "Joueur marché") {
  const user = await prisma.user.create({ data: { name, wallet: { create: { balance, lifetimeEarnings: balance } } } });
  created.users.push(user.id);
  return user;
}
async function fixture() {
  const seller = await player(0, "Vendeur");
  const buyer = await player(500, "Acheteur");
  const sport = await prisma.sport.create({ data: { slug: randomUUID(), nameFr: "Sport marché", providerName: `Marché ${randomUUID()}`, active: true } });
  created.sports.push(sport.id);
  const athlete = await prisma.athlete.create({ data: { name: `Star ${randomUUID()}`, sportId: sport.id } });
  const edition = await prisma.cardEdition.create({ data: { athleteId: athlete.id, name: "Or", rarity: "LEGENDARY", baseValue: 600, active: true } });
  const card = (ownerId: string) => prisma.cardInstance.create({ data: { editionId: edition.id, ownerId, acquisitionSource: "BOOSTER" } });
  return { seller, buyer, sport, athlete, edition, card: await card(seller.id), spare: await card(seller.id), buyerCard: await card(buyer.id) };
}
const balance = async (userId: string) => (await prisma.wallet.findUniqueOrThrow({ where: { userId } })).balance;

describe("Annonces", () => {
  it("met en vente une carte possédée, une seule fois, et bloque sa revente à la banque", async () => {
    const data = await fixture();
    const first = await createListing(data.seller.id, { cardInstanceId: data.card.id, price: 300 }, prisma);
    expect(first).toMatchObject({ replay: false, listing: { price: "300", status: "ACTIVE" } });
    expect(await createListing(data.seller.id, { cardInstanceId: data.card.id, price: 300 }, prisma)).toMatchObject({ replay: true, listing: { id: first.listing.id } });
    await expect(createListing(data.seller.id, { cardInstanceId: data.card.id, price: 250 }, prisma)).rejects.toMatchObject({ code: "CARD_ALREADY_LISTED" });
    await expect(createListing(data.seller.id, { cardInstanceId: data.buyerCard.id, price: 10 }, prisma)).rejects.toMatchObject({ code: "CARD_NOT_OWNED", status: 404 });
    for (const price of [0, -5, 1.5, 2_000_000_000]) await expect(createListing(data.seller.id, { cardInstanceId: data.spare.id, price }, prisma)).rejects.toThrow();
    await expect(sellToBank(data.seller.id, { cardInstanceId: data.card.id }, randomUUID(), prisma)).rejects.toMatchObject({ code: "CARD_LISTED" });
    // Parallel listings of the same card: the partial unique index and the card lock leave one active listing.
    const outcomes = await Promise.allSettled([310, 320, 330].map((price) => createListing(data.seller.id, { cardInstanceId: data.spare.id, price }, prisma)));
    expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1);
    expect(await prisma.marketplaceListing.count({ where: { cardInstanceId: data.spare.id, status: "ACTIVE" } })).toBe(1);
  });

  it("retire sa propre annonce, sans effet au second retrait, et refuse celle d’un autre", async () => {
    const data = await fixture();
    const { listing } = await createListing(data.seller.id, { cardInstanceId: data.card.id, price: 300 }, prisma);
    await expect(cancelListing(data.buyer.id, listing.id, prisma)).rejects.toMatchObject({ code: "LISTING_NOT_FOUND" });
    expect(await cancelListing(data.seller.id, listing.id, prisma)).toMatchObject({ replay: false, listing: { status: "CANCELLED" } });
    expect(await cancelListing(data.seller.id, listing.id, prisma)).toMatchObject({ replay: true });
    await expect(buyListing(data.buyer.id, listing.id, randomUUID(), prisma)).rejects.toMatchObject({ code: "LISTING_UNAVAILABLE" });
    // Relisting after a cancellation is allowed; the card can then be sold to the bank once unlisted.
    const relisted = await createListing(data.seller.id, { cardInstanceId: data.card.id, price: 280 }, prisma);
    expect(relisted.listing.id).not.toBe(listing.id);
  });
});

describe("Achats", () => {
  it("débite, crédite, transfère la carte et clôt l’annonce atomiquement, avec rejeu idempotent", async () => {
    const data = await fixture();
    const { listing } = await createListing(data.seller.id, { cardInstanceId: data.card.id, price: 300 }, prisma);
    const key = randomUUID();
    expect(await buyListing(data.buyer.id, listing.id, key, prisma)).toEqual({ listingId: listing.id, cardInstanceId: data.card.id, price: "300", balance: "200", replay: false });
    expect(await balance(data.buyer.id)).toBe(BigInt(200));
    expect(await balance(data.seller.id)).toBe(BigInt(300));
    expect(await prisma.wallet.findUniqueOrThrow({ where: { userId: data.buyer.id } })).toMatchObject({ lifetimeSpending: BigInt(300) });
    expect(await prisma.cardInstance.findUniqueOrThrow({ where: { id: data.card.id } })).toMatchObject({ ownerId: data.buyer.id, acquisitionSource: "MARKETPLACE" });
    expect(await prisma.marketplaceListing.findUniqueOrThrow({ where: { id: listing.id } })).toMatchObject({ status: "SOLD", buyerId: data.buyer.id });
    expect(await prisma.cardDiscovery.count({ where: { userId: data.buyer.id, editionId: data.edition.id } })).toBe(1);
    expect((await prisma.walletTransaction.findMany({ where: { walletId: { in: [data.buyer.id, data.seller.id] } }, orderBy: { walletId: "asc" } }))
      .map((row) => [row.walletId === data.buyer.id ? "acheteur" : "vendeur", row.type, row.amount, row.balanceAfter]).sort())
      .toEqual([["acheteur", "MARKETPLACE_PURCHASE", BigInt(-300), BigInt(200)], ["vendeur", "MARKETPLACE_SALE", BigInt(300), BigInt(300)]]);
    expect(await buyListing(data.buyer.id, listing.id, key, prisma)).toMatchObject({ replay: true, balance: "200" });
    expect(await balance(data.buyer.id)).toBe(BigInt(200));
    const other = await createListing(data.seller.id, { cardInstanceId: data.spare.id, price: 10 }, prisma);
    await expect(buyListing(data.buyer.id, other.listing.id, key, prisma)).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
    await expect(buyListing(data.seller.id, listing.id, randomUUID(), prisma)).rejects.toMatchObject({ code: "LISTING_UNAVAILABLE" });
    expect(await marketplaceHistory(data.buyer.id, prisma)).toEqual([expect.objectContaining({ id: listing.id, direction: "purchase", price: "300" })]);
    expect(await marketplaceHistory(data.seller.id, prisma)).toEqual([expect.objectContaining({ id: listing.id, direction: "sale" })]);
  });

  it("refuse son propre achat et un solde insuffisant sans rien modifier", async () => {
    const data = await fixture();
    const { listing } = await createListing(data.seller.id, { cardInstanceId: data.card.id, price: 501 }, prisma);
    await expect(buyListing(data.seller.id, listing.id, randomUUID(), prisma)).rejects.toMatchObject({ code: "OWN_LISTING" });
    await expect(buyListing(data.buyer.id, listing.id, randomUUID(), prisma)).rejects.toMatchObject({ code: "INSUFFICIENT_FUNDS" });
    await expect(buyListing(data.buyer.id, listing.id, "pas-une-uuid", prisma)).rejects.toThrow();
    await expect(buyListing(data.buyer.id, "inconnue", randomUUID(), prisma)).rejects.toMatchObject({ code: "LISTING_UNAVAILABLE" });
    expect(await balance(data.buyer.id)).toBe(BigInt(500));
    expect(await prisma.cardInstance.findUniqueOrThrow({ where: { id: data.card.id } })).toMatchObject({ ownerId: data.seller.id });
    expect(await prisma.marketplaceListing.findUniqueOrThrow({ where: { id: listing.id } })).toMatchObject({ status: "ACTIVE" });
    expect(await prisma.walletTransaction.count({ where: { walletId: { in: [data.buyer.id, data.seller.id] } } })).toBe(0);
  });

  it("ne vend une annonce qu’une fois face à des acheteurs simultanés", async () => {
    const data = await fixture();
    const buyers = [data.buyer, ...await Promise.all([1, 2, 3, 4].map((index) => player(500, `Acheteur ${index}`)))];
    const { listing } = await createListing(data.seller.id, { cardInstanceId: data.card.id, price: 300 }, prisma);
    const outcomes = await Promise.allSettled(buyers.map((buyer) => buyListing(buyer.id, listing.id, randomUUID(), prisma)));
    expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1);
    expect(new Set(outcomes.flatMap((outcome) => outcome.status === "rejected" ? [outcome.reason.code] : []))).toEqual(new Set(["LISTING_UNAVAILABLE"]));
    expect(await balance(data.seller.id)).toBe(BigInt(300));
    const balances = await Promise.all(buyers.map((buyer) => balance(buyer.id)));
    expect(balances.reduce((sum, value) => sum + value, BigInt(0))).toBe(BigInt(500 * 5 - 300));
  });

  it("ne laisse jamais un solde négatif quand un joueur achète deux annonces en parallèle", async () => {
    const data = await fixture();
    const first = await createListing(data.seller.id, { cardInstanceId: data.card.id, price: 300 }, prisma);
    const second = await createListing(data.seller.id, { cardInstanceId: data.spare.id, price: 300 }, prisma);
    const outcomes = await Promise.allSettled([first, second].map(({ listing }) => buyListing(data.buyer.id, listing.id, randomUUID(), prisma)));
    expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1);
    expect(outcomes.find((outcome) => outcome.status === "rejected")).toMatchObject({ reason: { code: "INSUFFICIENT_FUNDS" } });
    expect(await balance(data.buyer.id)).toBe(BigInt(200));
  });
});

describe("Consultation du marché", () => {
  it("liste les annonces actives avec filtres, tri par prix et vue « mes annonces »", async () => {
    const data = await fixture();
    const cheap = await createListing(data.seller.id, { cardInstanceId: data.card.id, price: 100 }, prisma);
    const pricey = await createListing(data.seller.id, { cardInstanceId: data.spare.id, price: 900 }, prisma);
    const mine = await createListing(data.buyer.id, { cardInstanceId: data.buyerCard.id, price: 450 }, prisma);
    const scoped = { sportId: data.sport.id };
    expect((await listMarketplace(data.buyer.id, { ...scoped, sort: "price-asc" }, prisma)).listings.map((row) => row.id))
      .toEqual([cheap.listing.id, mine.listing.id, pricey.listing.id]);
    expect((await listMarketplace(data.buyer.id, { ...scoped, minPrice: 200, maxPrice: 800 }, prisma)).listings.map((row) => [row.id, row.mine]))
      .toEqual([[mine.listing.id, true]]);
    expect((await listMarketplace(data.buyer.id, { ...scoped, view: "mine" }, prisma)).total).toBe(1);
    expect((await listMarketplace(data.buyer.id, { ...scoped, rarity: "COMMON" }, prisma)).total).toBe(0);
    await cancelListing(data.seller.id, cheap.listing.id, prisma);
    expect((await listMarketplace(data.buyer.id, scoped, prisma)).total).toBe(2);
    const row = (await listMarketplace(data.buyer.id, { ...scoped, sort: "price-desc" }, prisma)).listings[0]!;
    expect(row).toMatchObject({ id: pricey.listing.id, seller: "Vendeur", mine: false, baseValue: "600", card: { instanceId: data.spare.id, rarity: "LEGENDARY" } });
    await expect(listMarketplace(data.buyer.id, { sellerId: data.seller.id }, prisma)).rejects.toThrow();
  });
});
