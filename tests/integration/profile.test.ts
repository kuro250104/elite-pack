import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, type Prisma } from "@/generated/prisma/client";
import { getPlayerProfile, getWalletBalance } from "@/server/players/profile";
import { afterAll, describe, expect, it } from "vitest";

const connectionString = process.env.TEST_DATABASE_URL;
if (!connectionString) throw new Error("TEST_DATABASE_URL est obligatoire pour le profil.");
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
afterAll(async () => prisma.$disconnect());
async function isolated(test: (tx: Prisma.TransactionClient, client: PrismaClient) => Promise<void>) {
  const rollback = new Error("Annulation volontaire du scénario profil");
  // The profile only reads, so the transaction client can stand in for the full client.
  await expect(prisma.$transaction(async (tx) => { await test(tx, tx as unknown as PrismaClient); throw rollback; }))
    .rejects.toBe(rollback);
}

describe("Profil joueur", () => {
  it("résume portefeuille, collection, découvertes et boosters du seul joueur demandé", async () => isolated(async (tx, client) => {
    const player = await tx.user.create({ data: { name: "Joueur profil", email: `profil-${randomUUID()}@example.com`,
      wallet: { create: { balance: 1240, lifetimeEarnings: 2000, lifetimeSpending: 760 } },
      passiveBoosters: { create: { stock: 3, generatedTotal: 7 } } } });
    const other = await tx.user.create({ data: {} });
    const sport = await tx.sport.create({ data: { slug: randomUUID(), nameFr: "Sport profil", providerName: "Test" } });
    const athlete = await tx.athlete.create({ data: { name: "Athlète profil", sportId: sport.id } });
    const secondAthlete = await tx.athlete.create({ data: { name: "Second athlète profil", sportId: sport.id } });
    const common = await tx.cardEdition.create({ data: { athleteId: athlete.id, name: "Standard", rarity: "COMMON" } });
    const mythic = await tx.cardEdition.create({ data: { athleteId: athlete.id, name: "Mythique", rarity: "MYTHIC" } });
    const sold = await tx.cardEdition.create({ data: { athleteId: secondAthlete.id, name: "Argent", rarity: "RARE" } });
    const booster = await tx.boosterType.create({ data: { slug: randomUUID(), nameFr: "Booster profil", category: "MULTISPORT" } });
    const opening = (userId: string, usedPassiveStock: boolean) => tx.boosterOpening.create({ data: { userId, boosterTypeId: booster.id,
      usedPassiveStock, idempotencyKey: randomUUID(), configurationSnapshot: {} } });
    await opening(player.id, true); await opening(player.id, true); await opening(player.id, false); await opening(other.id, true);
    const mint = (editionId: string, ownerId: string | null, retiredAt: Date | null = null) =>
      tx.cardInstance.create({ data: { editionId, ownerId, retiredAt, acquisitionSource: "ADMIN" } });
    await mint(common.id, player.id); await mint(common.id, player.id); await mint(mythic.id, player.id);
    await mint(sold.id, null, new Date()); await mint(common.id, other.id);
    for (const edition of [common, mythic, sold]) await tx.cardDiscovery.create({ data: { userId: player.id, editionId: edition.id } });

    const profile = await getPlayerProfile(player.id, client);
    expect(profile).toMatchObject({ id: player.id, name: "Joueur profil", role: "PLAYER",
      wallet: { balance: "1240", lifetimeEarnings: "2000", lifetimeSpending: "760" },
      collection: { cards: 3, editions: 2, discoveredEditions: 3, discoveredAthletes: 2 },
      boosters: { opened: 3, openedFromFreeStock: 2, freeGenerated: 7 } });
    expect(profile.collection.byRarity).toEqual([
      { rarity: "COMMON", count: 2 }, { rarity: "UNCOMMON", count: 0 }, { rarity: "RARE", count: 0 },
      { rarity: "EPIC", count: 0 }, { rarity: "LEGENDARY", count: 0 }, { rarity: "MYTHIC", count: 1 },
    ]);
    expect(profile).not.toHaveProperty("passwordHash");
    expect(() => JSON.stringify(profile)).not.toThrow();
    expect(await getWalletBalance(player.id, client)).toBe(BigInt(1240));
  }));

  it("renvoie des compteurs nuls pour un nouveau joueur et refuse un joueur absent", async () => isolated(async (tx, client) => {
    const player = await tx.user.create({ data: {} });
    expect(await getPlayerProfile(player.id, client)).toMatchObject({
      wallet: { balance: "0" }, collection: { cards: 0, editions: 0, discoveredEditions: 0, discoveredAthletes: 0 },
      boosters: { opened: 0, openedFromFreeStock: 0, freeGenerated: 0 } });
    expect(await getWalletBalance(player.id, client)).toBe(BigInt(0));
    await expect(getPlayerProfile("profil-absent", client)).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
  }));
});
