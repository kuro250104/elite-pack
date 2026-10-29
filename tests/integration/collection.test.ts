import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, type Prisma } from "@/generated/prisma/client";
import { listCollection } from "@/server/collection/service";
import { afterAll, describe, expect, it } from "vitest";

const connectionString = process.env.TEST_DATABASE_URL;
if (!connectionString) throw new Error("TEST_DATABASE_URL est obligatoire pour les collections.");
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
afterAll(async () => prisma.$disconnect());
async function isolated(test: (tx: Prisma.TransactionClient, client: PrismaClient) => Promise<void>) {
  const rollback = new Error("Annulation volontaire du scénario collection");
  await expect(prisma.$transaction(async (tx) => {
    const client = new Proxy(prisma, { get(target, property) {
      if (["user", "cardInstance"].includes(String(property))) return Reflect.get(tx, property);
      return Reflect.get(target, property);
    } });
    await test(tx, client);
    throw rollback;
  })).rejects.toBe(rollback);
}
async function fixture(tx: Prisma.TransactionClient) {
  const player = await tx.user.create({ data: {} });
  const otherPlayer = await tx.user.create({ data: {} });
  const sport = await tx.sport.create({ data: { slug: randomUUID(), nameFr: "Sport de test", providerName: "Test" } });
  const athlete = await tx.athlete.create({ data: { name: "Alpha de test", sportId: sport.id, prestigeScore: 10, prestigeOverride: 90 } });
  const otherAthlete = await tx.athlete.create({ data: { name: "Beta de test", sportId: sport.id } });
  const edition = await tx.cardEdition.create({ data: { athleteId: athlete.id, name: "Standard", rarity: "COMMON" } });
  const rareEdition = await tx.cardEdition.create({ data: { athleteId: otherAthlete.id, name: "Argent", rarity: "RARE" } });
  const first = await tx.cardInstance.create({ data: { editionId: edition.id, ownerId: player.id, acquisitionSource: "ADMIN", acquiredAt: new Date("2026-01-01T00:00:00Z") } });
  const second = await tx.cardInstance.create({ data: { editionId: edition.id, ownerId: player.id, acquisitionSource: "ADMIN", acquiredAt: new Date("2026-01-02T00:00:00Z") } });
  const third = await tx.cardInstance.create({ data: { editionId: rareEdition.id, ownerId: player.id, acquisitionSource: "ADMIN", acquiredAt: new Date("2026-01-03T00:00:00Z") } });
  const other = await tx.cardInstance.create({ data: { editionId: edition.id, ownerId: otherPlayer.id, acquisitionSource: "ADMIN" } });
  const retired = await tx.cardInstance.create({ data: { editionId: edition.id, ownerId: null, retiredAt: new Date(), acquisitionSource: "ADMIN" } });
  return { player, otherPlayer, sport, edition, rareEdition, first, second, third, other, retired };
}

describe("Collection personnelle paginée", () => {
  it("isole les propriétaires, masque les cartes retirées et compte les doublons détenus", async () => isolated(async (tx, client) => {
    const data = await fixture(tx);
    const collection = await listCollection(data.player.id, {}, client);
    expect(collection.total).toBe(3);
    expect(collection.cards.map((card) => card.instanceId)).toEqual([data.third.id, data.second.id, data.first.id]);
    expect(collection.duplicates).toEqual({ [data.edition.id]: 2, [data.rareEdition.id]: 1 });
    expect(collection.cards.find((card) => card.instanceId === data.first.id)?.prestigeScore).toBe(90);
    expect(collection.cards.map((card) => card.instanceId)).not.toContain(data.other.id);
    expect(collection.cards.map((card) => card.instanceId)).not.toContain(data.retired.id);
    const other = await listCollection(data.otherPlayer.id, {}, client);
    expect(other.cards.map((card) => card.instanceId)).toEqual([data.other.id]);
    expect(other.duplicates).toEqual({ [data.edition.id]: 1 });
    expect(() => JSON.stringify(collection)).not.toThrow();
    expect(collection.cards[0]).not.toHaveProperty("ownerId");
  }));

  it("pagine les exemplaires sans changer les totaux ni le nombre de doublons", async () => isolated(async (tx, client) => {
    const data = await fixture(tx);
    const pages = [];
    for (let page = 1; page <= 4; page++) pages.push(await listCollection(data.player.id, { page, pageSize: 1 }, client));
    expect(pages.map((page) => page.total)).toEqual([3,3,3,3]);
    expect(pages.map((page) => page.cards.length)).toEqual([1,1,1,0]);
    expect(pages.flatMap((page) => page.cards.map((card) => card.instanceId))).toEqual([data.third.id, data.second.id, data.first.id]);
    expect(pages[1]?.duplicates[data.edition.id]).toBe(2);
    expect(pages[2]?.duplicates[data.edition.id]).toBe(2);
  }));

  it("applique sport, rareté et recherche sans élargir le périmètre du joueur", async () => isolated(async (tx, client) => {
    const data = await fixture(tx);
    const rare = await listCollection(data.player.id, { sportId: data.sport.id, rarity: "RARE", query: "BETA" }, client);
    expect(rare.total).toBe(1);
    expect(rare.cards.map((card) => card.instanceId)).toEqual([data.third.id]);
    expect((await listCollection(data.player.id, { sportId: randomUUID() }, client)).total).toBe(0);
    expect((await listCollection(data.player.id, { query: "ALPHA", sort: "name" }, client)).total).toBe(2);
  }));

  it("refuse un joueur absent et un filtre autoritaire inattendu", async () => isolated(async (_tx, client) => {
    await expect(listCollection("collection-absent-user", {}, client)).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    await expect(listCollection("collection-absent-user", { ownerId: "another-owner" }, client)).rejects.toThrow();
  }));
});
