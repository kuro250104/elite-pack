import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, type Prisma } from "@/generated/prisma/client";
import { getEconomySettings, recentAdminChanges, updateBoosterSettings, updateEconomySettings } from "@/server/admin/economy";
import { getAdminStats } from "@/server/admin/stats";
import { afterAll, describe, expect, it } from "vitest";

const connectionString = process.env.TEST_DATABASE_URL;
if (!connectionString) throw new Error("TEST_DATABASE_URL est obligatoire pour l’administration.");
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
afterAll(async () => prisma.$disconnect());
// Every scenario runs in a transaction rolled back at the end: the shared configuration is never really modified.
async function isolated(test: (tx: Prisma.TransactionClient, client: PrismaClient) => Promise<void>) {
  const rollback = new Error("Annulation volontaire du scénario administration");
  await expect(prisma.$transaction(async (tx) => { await test(tx, tx as unknown as PrismaClient); throw rollback; }, { timeout: 15_000 }))
    .rejects.toBe(rollback);
}
const settings = { startingBalance: 750, bankResaleBasisPoints: 5000, passiveIntervalSeconds: 600, passiveMaxStock: 8,
  rarityValues: { COMMON: 20, UNCOMMON: 40, RARE: 100, EPIC: 300, LEGENDARY: 800, MYTHIC: 3000 } };
const weights = { COMMON: 6000, UNCOMMON: 2500, RARE: 1000, EPIC: 400, LEGENDARY: 100, MYTHIC: 0 };

describe("Règles économiques", () => {
  it("enregistre la configuration, revalorise toutes les éditions et journalise avant/après", async () => isolated(async (tx, client) => {
    const admin = await tx.user.create({ data: { role: "ADMIN", name: "Admin économie" } });
    const sport = await tx.sport.create({ data: { slug: randomUUID(), nameFr: "Sport admin", providerName: "Admin" } });
    const athlete = await tx.athlete.create({ data: { name: "Athlète admin", sportId: sport.id, prestigeScore: 50 } });
    const edition = await tx.cardEdition.create({ data: { athleteId: athlete.id, name: "Or", rarity: "LEGENDARY", baseValue: 1 } });
    const before = await getEconomySettings(tx);
    expect(await updateEconomySettings(tx, admin.id, settings)).toMatchObject({ settings, revalued: expect.any(Number) });
    expect(await getEconomySettings(tx)).toEqual(settings);
    expect((await tx.cardEdition.findUniqueOrThrow({ where: { id: edition.id } })).baseValue).toBe(BigInt(1200));
    const audit = await tx.adminAuditLog.findFirstOrThrow({ where: { actorId: admin.id, action: "ECONOMY_UPDATE" } });
    expect(audit).toMatchObject({ before, after: settings });
    expect((await recentAdminChanges(client, ["ECONOMY_UPDATE"], 1))[0]).toMatchObject({ label: "Règles économiques modifiées", actor: "Admin économie" });
    // Unchanged rarity values do not trigger a revaluation.
    expect(await updateEconomySettings(tx, admin.id, { ...settings, startingBalance: 0 })).toMatchObject({ revalued: 0 });
  }));

  it("refuse les valeurs invalides et les non-administrateurs sans rien modifier", async () => isolated(async (tx) => {
    const admin = await tx.user.create({ data: { role: "ADMIN" } });
    const player = await tx.user.create({ data: {} });
    const before = await getEconomySettings(tx);
    await expect(updateEconomySettings(tx, player.id, settings)).rejects.toMatchObject({ status: 403 });
    for (const invalid of [{ ...settings, bankResaleBasisPoints: 10_001 }, { ...settings, passiveMaxStock: 11 },
      { ...settings, startingBalance: -1 }, { ...settings, passiveIntervalSeconds: 30 }, { ...settings, startingBalance: 1.5 },
      { ...settings, rarityValues: { ...settings.rarityValues, MYTHIC: undefined } }, { ...settings, extra: true }]) {
      await expect(updateEconomySettings(tx, admin.id, invalid)).rejects.toThrow();
    }
    expect(await getEconomySettings(tx)).toEqual(before);
  }));
});

describe("Réglages des boosters", () => {
  it("met à jour cartes et probabilités totalisant 100 %, refuse tout autre total", async () => isolated(async (tx) => {
    const admin = await tx.user.create({ data: { role: "ADMIN" } });
    const booster = await tx.boosterType.create({ data: { slug: randomUUID(), nameFr: "Booster admin", category: "MULTISPORT" } });
    expect(await updateBoosterSettings(tx, admin.id, booster.id, { cardCount: 3, weights })).toEqual({ cardCount: 3, weights });
    const stored = await tx.boosterType.findUniqueOrThrow({ where: { id: booster.id }, include: { weights: true } });
    expect(stored.cardCount).toBe(3);
    expect(Object.fromEntries(stored.weights.map((weight) => [weight.rarity, weight.weightBasisPoints]))).toEqual(weights);
    await expect(updateBoosterSettings(tx, admin.id, booster.id, { cardCount: 3, weights: { ...weights, COMMON: 5999 } }))
      .rejects.toThrow("100 %");
    await expect(updateBoosterSettings(tx, admin.id, booster.id, { cardCount: 0, weights })).rejects.toThrow();
    await expect(updateBoosterSettings(tx, admin.id, "inconnu", { cardCount: 5, weights })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(await tx.adminAuditLog.count({ where: { actorId: admin.id, action: "BOOSTER_SETTINGS_UPDATE" } })).toBe(1);
  }));
});

describe("Indicateurs administrateur", () => {
  it("compte joueurs, cartes par rareté, boosters, marché et reventes", async () => isolated(async (tx, client) => {
    const before = await getAdminStats(client);
    const seller = await tx.user.create({ data: { passiveBoosters: { create: { generatedTotal: 7 } }, wallet: { create: {} } } });
    const buyer = await tx.user.create({ data: {} });
    const sport = await tx.sport.create({ data: { slug: randomUUID(), nameFr: "Sport stats", providerName: "Stats" } });
    const athlete = await tx.athlete.create({ data: { name: "Athlète stats", sportId: sport.id } });
    const edition = await tx.cardEdition.create({ data: { athleteId: athlete.id, name: "Mythique", rarity: "MYTHIC", active: true } });
    const sold = await tx.cardInstance.create({ data: { editionId: edition.id, ownerId: buyer.id, acquisitionSource: "MARKETPLACE" } });
    await tx.cardInstance.create({ data: { editionId: edition.id, ownerId: null, retiredAt: new Date(), acquisitionSource: "BOOSTER" } });
    await tx.marketplaceListing.create({ data: { cardInstanceId: sold.id, sellerId: seller.id, buyerId: buyer.id, price: 250, status: "SOLD", closedAt: new Date() } });
    await tx.walletTransaction.create({ data: { walletId: seller.id, type: "BANK_SALE", amount: 40, balanceAfter: 40, idempotencyKey: randomUUID() } });
    const booster = await tx.boosterType.create({ data: { slug: randomUUID(), nameFr: "Booster stats", category: "MULTISPORT" } });
    await tx.boosterOpening.create({ data: { userId: seller.id, boosterTypeId: booster.id, usedPassiveStock: true, idempotencyKey: randomUUID(), configurationSnapshot: {} } });
    const after = await getAdminStats(client);
    expect(after.users - before.users).toBe(2);
    expect(after.editions.active - before.editions.active).toBe(1);
    expect(after.cards.minted - before.cards.minted).toBe(2);
    expect(after.cards.retired - before.cards.retired).toBe(1);
    const mythic = (stats: typeof before) => stats.cards.byRarity.find((row) => row.rarity === "MYTHIC")!.count;
    expect(mythic(after) - mythic(before)).toBe(2);
    expect(BigInt(after.boosters.passiveGenerated) - BigInt(before.boosters.passiveGenerated)).toBe(BigInt(7));
    expect(after.boosters.openedFromPassive - before.boosters.openedFromPassive).toBe(1);
    expect(after.marketplace.sales - before.marketplace.sales).toBe(1);
    expect(BigInt(after.marketplace.volume) - BigInt(before.marketplace.volume)).toBe(BigInt(250));
    expect(BigInt(after.bank.paid) - BigInt(before.bank.paid)).toBe(BigInt(40));
    expect(() => JSON.stringify(after)).not.toThrow();
  }));
});
