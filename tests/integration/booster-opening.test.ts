import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, type Prisma } from "@/generated/prisma/client";
import { openBooster, openingRarities } from "@/server/boosters/opening";
import { afterAll, describe, expect, it } from "vitest";
const connectionString = process.env.TEST_DATABASE_URL;
if (!connectionString) throw new Error("TEST_DATABASE_URL est obligatoire pour les ouvertures.");
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
afterAll(async () => prisma.$disconnect());
async function fixture(tx: Prisma.TransactionClient, maxSupply: number | null = null) {
  const user = await tx.user.create({ data: {} });
  const otherUser = await tx.user.create({ data: {} });
  const sport = await tx.sport.create({ data: { slug: randomUUID(), nameFr: "Sport de test", providerName: "Test", active: true } });
  const athlete = await tx.athlete.create({ data: { name: "Athlète de test", sportId: sport.id, active: true } });
  const edition = await tx.cardEdition.create({ data: { athleteId: athlete.id, name: "Standard", rarity: "COMMON", active: true, maxSupply } });
  const booster = await tx.boosterType.create({ data: { slug: randomUUID(), nameFr: "Booster de test", category: "SPORT", active: true,
    sports: { create: { sportId: sport.id } }, weights: { create: openingRarities.map((rarity) => ({ rarity, weightBasisPoints: rarity === "COMMON" ? 10000 : 0 })) } } });
  await tx.boosterInventory.createMany({ data: [user.id, otherUser.id].map((userId) => ({ userId, boosterTypeId: booster.id, quantity: 1 })) });
  await tx.passiveBoosterState.create({ data: { userId: user.id, stock: 2, nextGenerationAt: new Date(Date.now() + 900000) } });
  const command = { boosterTypeId: booster.id, sportId: sport.id, source: "welcome" as const, idempotencyKey: randomUUID() };
  return { user, otherUser, sport, athlete, edition, booster, command };
}
function clientWithin(tx: Prisma.TransactionClient) {
  let sequence = 0;
  return new Proxy(prisma, { get(target, property) {
    if (property === "$transaction") return async <T>(operation: (transaction: Prisma.TransactionClient) => Promise<T>) => {
      const savepoint = `opening_${sequence++}`;
      await tx.$executeRawUnsafe(`SAVEPOINT ${savepoint}`);
      try {
        const result = await operation(tx);
        await tx.$executeRawUnsafe(`RELEASE SAVEPOINT ${savepoint}`);
        return result;
      } catch (error) {
        await tx.$executeRawUnsafe(`ROLLBACK TO SAVEPOINT ${savepoint}`);
        await tx.$executeRawUnsafe(`RELEASE SAVEPOINT ${savepoint}`);
        throw error;
      }
    };
    return Reflect.get(target, property);
  } });
}
async function isolated(test: (tx: Prisma.TransactionClient, client: PrismaClient) => Promise<void>) {
  const rollback = new Error("Annulation volontaire du scénario booster");
  await expect(prisma.$transaction(async (tx) => { await test(tx, clientWithin(tx)); throw rollback; }, { timeout: 15000 })).rejects.toBe(rollback);
}
async function cleanup(data: Awaited<ReturnType<typeof fixture>>) {
  await prisma.$transaction(async (tx) => {
    await tx.cardInstance.deleteMany({ where: { editionId: data.edition.id } });
    await tx.cardDiscovery.deleteMany({ where: { editionId: data.edition.id } });
    await tx.boosterOpening.deleteMany({ where: { boosterTypeId: data.booster.id } });
    await tx.boosterInventory.deleteMany({ where: { boosterTypeId: data.booster.id } });
    await tx.passiveBoosterState.deleteMany({ where: { userId: { in: [data.user.id, data.otherUser.id] } } });
    await tx.boosterType.delete({ where: { id: data.booster.id } });
    await tx.cardEdition.delete({ where: { id: data.edition.id } });
    await tx.athlete.delete({ where: { id: data.athlete.id } });
    await tx.sport.delete({ where: { id: data.sport.id } });
    await tx.user.deleteMany({ where: { id: { in: [data.user.id, data.otherUser.id] } } });
  });
}

describe("Ouverture sécurisée", () => {
  it("consomme une fois et rejoue sans frapper, refuse la clé avec autre entrée", async () => isolated(async (tx, client) => {
    const data = await fixture(tx);
    const opened = await openBooster(data.user.id, data.command, client);
    expect(opened.cards).toHaveLength(5);
    expect(opened.replay).toBe(false);
    expect(new Set(opened.cards.map((card) => card.instanceId)).size).toBe(5);
    expect(new Set(opened.cards.map((card) => card.editionId)).size).toBe(1);
    expect(() => JSON.stringify(opened)).not.toThrow();
    const replay = await openBooster(data.user.id, data.command, client);
    expect(replay).toEqual({ ...opened, replay: true });
    await expect(openBooster(data.user.id, { ...data.command, source: "passive" }, client)).rejects.toMatchObject({ code: "OPENING_KEY_CONFLICT" });
    expect((await tx.boosterInventory.findUniqueOrThrow({ where: { userId_boosterTypeId: { userId: data.user.id, boosterTypeId: data.booster.id } } })).quantity).toBe(0);
    expect(await tx.boosterOpening.count({ where: { userId: data.user.id } })).toBe(1);
  }));
  it("consomme le stock passif générique avec le sport choisi", async () => isolated(async (tx, client) => {
    const data = await fixture(tx);
    const state = await tx.passiveBoosterState.findUniqueOrThrow({ where: { userId: data.user.id } });
    await openBooster(data.user.id, { ...data.command, source: "passive" }, client);
    expect(await tx.passiveBoosterState.findUniqueOrThrow({ where: { userId: data.user.id } })).toMatchObject({ stock: 1, nextGenerationAt: state.nextGenerationAt });
    expect((await tx.boosterInventory.findUniqueOrThrow({ where: { userId_boosterTypeId: { userId: data.user.id, boosterTypeId: data.booster.id } } })).quantity).toBe(1);
  }));
  it("rejette les pools insuffisants et les probabilités invalides sans rien consommer", async () => isolated(async (tx, client) => {
    const data = await fixture(tx, 4);
    await expect(openBooster(data.user.id, data.command, client)).rejects.toMatchObject({ code: "BOOSTER_POOL_UNAVAILABLE" });
    await tx.cardEdition.update({ where: { id: data.edition.id }, data: { maxSupply: null } });
    await tx.boosterRarityWeight.update({ where: { boosterTypeId_rarity: { boosterTypeId: data.booster.id, rarity: "COMMON" } }, data: { weightBasisPoints: 5500 } });
    await expect(openBooster(data.user.id, data.command, client)).rejects.toMatchObject({ code: "BOOSTER_CONFIGURATION_INVALID" });
    await tx.boosterRarityWeight.update({ where: { boosterTypeId_rarity: { boosterTypeId: data.booster.id, rarity: "UNCOMMON" } }, data: { weightBasisPoints: 4500 } });
    await expect(openBooster(data.user.id, data.command, client)).rejects.toMatchObject({ code: "BOOSTER_POOL_UNAVAILABLE" });
    expect(await tx.cardInstance.count({ where: { editionId: data.edition.id } })).toBe(0);
    expect(await tx.boosterOpening.count({ where: { userId: data.user.id } })).toBe(0);
    expect((await tx.boosterInventory.findUniqueOrThrow({ where: { userId_boosterTypeId: { userId: data.user.id, boosterTypeId: data.booster.id } } })).quantity).toBe(1);
  }));
  it("annule ouverture et frappe lorsque le stock est vide", async () => isolated(async (tx, client) => {
    const data = await fixture(tx);
    await tx.boosterInventory.updateMany({ where: { userId: data.user.id }, data: { quantity: 0 } });
    await expect(openBooster(data.user.id, data.command, client)).rejects.toMatchObject({ code: "BOOSTER_STOCK_EMPTY" });
    expect(await tx.boosterOpening.count({ where: { userId: data.user.id } })).toBe(0);
    expect(await tx.cardInstance.count({ where: { editionId: data.edition.id } })).toBe(0);
  }));
  it("annule stock, tirage et découvertes si une frappe échoue en cours d’ouverture", async () => isolated(async (tx, client) => {
    const data = await fixture(tx);
    const failure = new Error("Échec volontaire de troisième frappe");
    let minted = 0;
    const failingClient = new Proxy(client, { get(target, property) {
      if (property === "$transaction") return async <T>(operation: (transaction: Prisma.TransactionClient) => Promise<T>) =>
        target.$transaction((transaction) => operation(new Proxy(transaction, { get(inner, key) {
          if (key === "cardInstance") return new Proxy(inner.cardInstance, { get(delegate, method) {
            if (method === "create") return async (args: Prisma.CardInstanceCreateArgs) => {
              if (++minted === 3) throw failure;
              return delegate.create(args);
            };
            return Reflect.get(delegate, method);
          } });
          return Reflect.get(inner, key);
        } })));
      return Reflect.get(target, property);
    } });
    await expect(openBooster(data.user.id, data.command, failingClient)).rejects.toBe(failure);
    expect(await tx.boosterOpening.count({ where: { userId: data.user.id } })).toBe(0);
    expect(await tx.cardInstance.count({ where: { editionId: data.edition.id } })).toBe(0);
    expect(await tx.cardDiscovery.count({ where: { editionId: data.edition.id } })).toBe(0);
    expect((await tx.cardEdition.findUniqueOrThrow({ where: { id: data.edition.id } })).mintedSupply).toBe(0);
    expect((await tx.boosterInventory.findUniqueOrThrow({ where: { userId_boosterTypeId: { userId: data.user.id, boosterTypeId: data.booster.id } } })).quantity).toBe(1);
  }));

  it("respecte restrictions de sport, saison, compétition et éditions", async () => isolated(async (tx, client) => {
    const data = await fixture(tx);
    await expect(openBooster(data.user.id, { ...data.command, sportId: randomUUID() }, client)).rejects.toMatchObject({ code: "SPORT_UNAVAILABLE" });
    await tx.boosterType.update({ where: { id: data.booster.id }, data: { season: "2026", competition: "Test" } });
    await expect(openBooster(data.user.id, data.command, client)).rejects.toMatchObject({ code: "BOOSTER_POOL_UNAVAILABLE" });
    await tx.cardEdition.update({ where: { id: data.edition.id }, data: { season: "2026", competition: "Test" } });
    await tx.boosterEdition.create({ data: { boosterTypeId: data.booster.id, editionId: data.edition.id } });
    expect((await openBooster(data.user.id, data.command, client)).cards).toHaveLength(5);
  }));
  it("réserve le stock passif aux boosters gratuits hors événement", async () => isolated(async (tx, client) => {
    const data = await fixture(tx);
    const passive = { ...data.command, source: "passive" as const };
    await tx.boosterType.update({ where: { id: data.booster.id }, data: { price: 100n } });
    await expect(openBooster(data.user.id, passive, client)).rejects.toMatchObject({ code: "PASSIVE_BOOSTER_NOT_ALLOWED" });
    await tx.boosterType.update({ where: { id: data.booster.id }, data: { price: 0n, category: "EVENT" } });
    await expect(openBooster(data.user.id, { ...passive, idempotencyKey: randomUUID() }, client)).rejects.toMatchObject({ code: "PASSIVE_BOOSTER_NOT_ALLOWED" });
    expect((await tx.passiveBoosterState.findUniqueOrThrow({ where: { userId: data.user.id } })).stock).toBe(2);
    expect(await tx.boosterOpening.count({ where: { userId: data.user.id } })).toBe(0);
  }));
  it("respecte les dates d’événement sans consommer de stock", async () => isolated(async (tx, client) => {
    const data = await fixture(tx);
    await tx.boosterType.update({ where: { id: data.booster.id }, data: { startsAt: new Date(Date.now() + 60000) } });
    await expect(openBooster(data.user.id, data.command, client)).rejects.toMatchObject({ code: "BOOSTER_UNAVAILABLE" });
    await tx.boosterType.update({ where: { id: data.booster.id }, data: { startsAt: null, endsAt: new Date(0) } });
    await expect(openBooster(data.user.id, data.command, client)).rejects.toMatchObject({ code: "BOOSTER_UNAVAILABLE" });
    expect(await tx.boosterOpening.count({ where: { userId: data.user.id } })).toBe(0);
    expect((await tx.boosterInventory.findUniqueOrThrow({ where: { userId_boosterTypeId: { userId: data.user.id, boosterTypeId: data.booster.id } } })).quantity).toBe(1);
  }));

  it("sérialise les ouvertures simultanées identiques sans double consommation", async () => {
    const data = await prisma.$transaction((tx) => fixture(tx, 5));
    try {
      const results = await Promise.all([openBooster(data.user.id, data.command, prisma), openBooster(data.user.id, data.command, prisma)]);
      expect(results.map((result) => result.replay).sort()).toEqual([false, true]);
      expect(new Set(results.map((result) => result.openingId)).size).toBe(1);
      expect(await prisma.cardInstance.count({ where: { editionId: data.edition.id } })).toBe(5);
      expect((await prisma.cardEdition.findUniqueOrThrow({ where: { id: data.edition.id } })).mintedSupply).toBe(5);
    } finally { await cleanup(data); }
  });
  it("protège le tirage limité entre joueurs et préserve le stock du perdant", async () => {
    const data = await prisma.$transaction((tx) => fixture(tx, 5));
    try {
      const results = await Promise.allSettled([openBooster(data.user.id, data.command, prisma),
        openBooster(data.otherUser.id, { ...data.command, idempotencyKey: randomUUID() }, prisma)]);
      expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
      const failure = results.find((result) => result.status === "rejected");
      expect(failure?.status === "rejected" ? failure.reason : null).toMatchObject({ code: "BOOSTER_POOL_UNAVAILABLE" });
      expect((await prisma.cardEdition.findUniqueOrThrow({ where: { id: data.edition.id } })).mintedSupply).toBe(5);
      const inventory = await prisma.boosterInventory.findMany({ where: { boosterTypeId: data.booster.id } });
      expect(inventory.map((stock) => stock.quantity).sort()).toEqual([0,1]);
      expect((await prisma.cardInstance.findMany({ where: { editionId: data.edition.id } })).map((card) => card.serialNumber).sort()).toEqual([1,2,3,4,5]);
    } finally { await cleanup(data); }
  });
});
