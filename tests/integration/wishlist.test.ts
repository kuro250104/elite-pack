import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, expect, it } from "vitest";
import { PrismaClient } from "@/generated/prisma/client";
import { addToWishlist, listWishlist, maxWishlistItems, removeFromWishlist, wishlistedEditionIds } from "@/server/wishlist/service";

const connectionString = process.env.TEST_DATABASE_URL;
if (!connectionString) throw new Error("TEST_DATABASE_URL est obligatoire pour les listes de souhaits.");
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
afterAll(() => prisma.$disconnect());

async function fixture() {
  return prisma.$transaction(async (tx) => {
    const player = await tx.user.create({ data: {} });
    const other = await tx.user.create({ data: {} });
    const sport = await tx.sport.create({ data: { slug: randomUUID(), nameFr: "Sport de test", providerName: "Test" } });
    const athlete = await tx.athlete.create({ data: { name: "Athlète de test", sportId: sport.id } });
    const edition = await tx.cardEdition.create({
      data: { athleteId: athlete.id, name: "Édition de test", rarity: "RARE", active: true, maxSupply: 100 },
    });
    return { actor: player.id, other: other.id, sport: sport.id, athlete: athlete.id, edition: edition.id };
  });
}

async function isolated(run: (data: Awaited<ReturnType<typeof fixture>>) => Promise<void>) {
  const data = await fixture();
  try {
    await run(data);
  } finally {
    await prisma.$transaction(async (tx) => {
      await tx.marketplaceListing.deleteMany({ where: { sellerId: { in: [data.actor, data.other] } } });
      await tx.cardInstance.deleteMany({ where: { edition: { athleteId: data.athlete } } });
      await tx.cardEdition.deleteMany({ where: { athleteId: data.athlete } });
      await tx.athlete.delete({ where: { id: data.athlete } });
      await tx.sport.delete({ where: { id: data.sport } });
      await tx.user.deleteMany({ where: { id: { in: [data.actor, data.other] } } });
    });
  }
}

it("ajoute, relit et retire une édition de la liste du joueur uniquement", () => isolated(async ({ actor, other, edition, athlete }) => {
  const first = await addToWishlist(actor, { editionId: edition }, prisma);
  expect(first.created).toBe(true);
  expect(await addToWishlist(actor, { editionId: edition }, prisma)).toEqual({ ...first, created: false });
  expect(await listWishlist(actor, { pageSize: 1 }, prisma)).toMatchObject({
    total: 1, page: 1, pageSize: 1,
    items: [{ editionId: edition, athleteId: athlete, name: "Athlète de test", sport: "Sport de test",
      editionName: "Édition de test", rarity: "RARE", maxSupply: 100, addedAt: first.item.addedAt,
      owned: false, activeListings: 0 }],
  });
  expect(await listWishlist(actor, { page: 2, pageSize: 1 }, prisma)).toMatchObject({ total: 1, items: [] });
  expect(await wishlistedEditionIds(actor, [edition], prisma)).toEqual(new Set([edition]));
  expect(await wishlistedEditionIds(other, [edition], prisma)).toEqual(new Set());
  expect((await listWishlist(other, {}, prisma)).total).toBe(0);
  await expect(removeFromWishlist(other, edition, prisma)).rejects.toMatchObject({ code: "WISHLIST_ITEM_NOT_FOUND" });
  expect(await removeFromWishlist(actor, edition, prisma)).toEqual({ removed: true });
  expect((await listWishlist(actor, {}, prisma)).total).toBe(0);
  await expect(removeFromWishlist(actor, edition, prisma)).rejects.toMatchObject({ code: "WISHLIST_ITEM_NOT_FOUND" });
}));

it("sérialise deux ajouts simultanés sans créer de doublon", () => isolated(async ({ actor, edition }) => {
  const input = { editionId: edition };
  const results = await Promise.all([addToWishlist(actor, input, prisma), addToWishlist(actor, input, prisma)]);
  expect(results.filter((result) => result.created)).toHaveLength(1);
  expect(await prisma.wishlistItem.count({ where: { userId: actor, editionId: edition } })).toBe(1);
}));

it("respecte la limite même lors de deux ajouts distincts simultanés", () => isolated(async ({ actor, athlete, edition }) => {
  const editions = await prisma.cardEdition.createManyAndReturn({
    data: Array.from({ length: maxWishlistItems }, (_, index) => ({
      athleteId: athlete, name: `Édition ${index}`, rarity: "COMMON", active: true,
    })),
    select: { id: true },
  });
  await prisma.wishlistItem.createMany({ data: editions.slice(1).map(({ id }) => ({ userId: actor, editionId: id })) });
  const results = await Promise.allSettled([edition, editions[0]!.id].map((editionId) => addToWishlist(actor, { editionId }, prisma)));
  expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
  expect(results).toContainEqual(expect.objectContaining({ status: "rejected", reason: expect.objectContaining({ code: "WISHLIST_FULL" }) }));
  expect((await listWishlist(actor, {}, prisma)).total).toBe(maxWishlistItems);
  const first = editions[1]!.id;
  expect((await addToWishlist(actor, { editionId: first }, prisma)).created).toBe(false);
}));

it("refuse les éditions introuvables et inactives", () => isolated(async ({ actor, edition }) => {
  await expect(addToWishlist(actor, { editionId: randomUUID() }, prisma)).rejects.toMatchObject({ code: "EDITION_NOT_FOUND" });
  await prisma.cardEdition.update({ where: { id: edition }, data: { active: false } });
  await expect(addToWishlist(actor, { editionId: edition }, prisma)).rejects.toMatchObject({ code: "EDITION_NOT_FOUND" });
}));

it("compte la possession et uniquement les annonces actives des autres joueurs", () => isolated(async ({ actor, other, edition }) => {
  const card = (ownerId: string) => prisma.cardInstance.create({ data: { editionId: edition, ownerId, acquisitionSource: "ADMIN" } });
  const [mine, listed, sold] = await Promise.all([card(actor), card(other), card(actor)]);
  await prisma.marketplaceListing.createMany({ data: [
    { cardInstanceId: mine.id, sellerId: actor, price: 10 },
    { cardInstanceId: listed.id, sellerId: other, price: 10 },
    { cardInstanceId: sold.id, sellerId: other, buyerId: actor, price: 10, status: "SOLD", closedAt: new Date() },
  ] });
  await addToWishlist(actor, { editionId: edition }, prisma);
  expect((await listWishlist(actor, {}, prisma)).items[0]).toMatchObject({ owned: true, activeListings: 1 });
}));
