import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { sellToBank } from "@/server/economy/bank";
import { updateAthlete } from "@/server/athletes/service";
import { recomputeSportPrestige } from "@/server/athletes/prestige";
import { afterAll, afterEach, describe, expect, it } from "vitest";

const connectionString = process.env.TEST_DATABASE_URL;
if (!connectionString) throw new Error("TEST_DATABASE_URL est obligatoire pour la revente.");
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
afterAll(async () => prisma.$disconnect());

// Sales commit their own transactions (concurrency is part of the contract), so fixtures are cleaned explicitly.
const created: { users: string[]; sports: string[] } = { users: [], sports: [] };
afterEach(async () => {
  await prisma.$transaction(async (tx) => {
    const athletes = (await tx.athlete.findMany({ where: { sportId: { in: created.sports } }, select: { id: true } })).map((row) => row.id);
    const editions = (await tx.cardEdition.findMany({ where: { athleteId: { in: athletes } }, select: { id: true } })).map((row) => row.id);
    await tx.marketplaceListing.deleteMany({ where: { card: { editionId: { in: editions } } } });
    await tx.cardInstance.deleteMany({ where: { editionId: { in: editions } } });
    await tx.cardDiscovery.deleteMany({ where: { editionId: { in: editions } } });
    await tx.cardEdition.deleteMany({ where: { id: { in: editions } } });
    await tx.adminAuditLog.deleteMany({ where: { actorId: { in: created.users } } });
    await tx.athlete.deleteMany({ where: { id: { in: athletes } } });
    await tx.sport.deleteMany({ where: { id: { in: created.sports } } });
    await tx.walletTransaction.deleteMany({ where: { walletId: { in: created.users } } });
    await tx.wallet.deleteMany({ where: { userId: { in: created.users } } });
    await tx.user.deleteMany({ where: { id: { in: created.users } } });
  });
  created.users = []; created.sports = [];
});

async function fixture(options: { wallet?: boolean } = {}) {
  const user = (data: object = {}) => prisma.user.create({ data }).then((row) => { created.users.push(row.id); return row; });
  const player = await user(options.wallet === false ? {} : { wallet: { create: { balance: 100, lifetimeEarnings: 100 } } });
  const other = await user({ wallet: { create: {} } });
  const admin = await user({ role: "ADMIN" });
  const sport = await prisma.sport.create({ data: { slug: randomUUID(), nameFr: "Sport banque", providerName: `Banque ${randomUUID()}` } });
  created.sports.push(sport.id);
  const athlete = await prisma.athlete.create({ data: { name: "Athlète banque", sportId: sport.id, prestigeScore: 50 } });
  const edition = await prisma.cardEdition.create({ data: { athleteId: athlete.id, name: "Or", rarity: "LEGENDARY", baseValue: 1000, maxSupply: 10, mintedSupply: 3 } });
  const card = (ownerId: string) => prisma.cardInstance.create({ data: { editionId: edition.id, ownerId, acquisitionSource: "ADMIN" } });
  await prisma.cardDiscovery.create({ data: { userId: player.id, editionId: edition.id } });
  return { player, other, admin, sport, athlete, edition, mine: await card(player.id), second: await card(player.id), foreign: await card(other.id) };
}

describe("Revente à la banque", () => {
  it("retire l’exemplaire, crédite 60 % de la valeur, journalise et conserve découverte et tirage", async () => {
    const data = await fixture();
    const key = randomUUID();
    expect(await sellToBank(data.player.id, { cardInstanceId: data.mine.id }, key, prisma))
      .toEqual({ cardInstanceId: data.mine.id, amount: "600", balance: "700", replay: false });
    expect(await prisma.cardInstance.findUniqueOrThrow({ where: { id: data.mine.id } })).toMatchObject({ ownerId: null, retiredAt: expect.any(Date) });
    expect(await prisma.wallet.findUniqueOrThrow({ where: { userId: data.player.id } })).toMatchObject({ balance: BigInt(700), lifetimeEarnings: BigInt(700) });
    expect(await prisma.walletTransaction.findMany({ where: { walletId: data.player.id } })).toEqual([expect.objectContaining({
      type: "BANK_SALE", amount: BigInt(600), balanceAfter: BigInt(700), referenceId: data.mine.id })]);
    expect(await prisma.cardDiscovery.count({ where: { userId: data.player.id, editionId: data.edition.id } })).toBe(1);
    expect((await prisma.cardEdition.findUniqueOrThrow({ where: { id: data.edition.id } })).mintedSupply).toBe(3);
    // Replaying the same request returns the stored result without a second credit.
    expect(await sellToBank(data.player.id, { cardInstanceId: data.mine.id }, key, prisma)).toMatchObject({ amount: "600", balance: "700", replay: true });
    await expect(sellToBank(data.player.id, { cardInstanceId: data.second.id }, key, prisma)).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
    await expect(sellToBank(data.player.id, { cardInstanceId: data.mine.id }, randomUUID(), prisma)).rejects.toMatchObject({ code: "CARD_NOT_OWNED", status: 404 });
    expect((await prisma.wallet.findUniqueOrThrow({ where: { userId: data.player.id } })).balance).toBe(BigInt(700));
  });

  it("refuse une carte d’un autre joueur, une carte en vente, un portefeuille absent et une clé invalide", async () => {
    const data = await fixture();
    await expect(sellToBank(data.player.id, { cardInstanceId: data.foreign.id }, randomUUID(), prisma)).rejects.toMatchObject({ code: "CARD_NOT_OWNED" });
    await expect(sellToBank(data.player.id, { cardInstanceId: "inconnue" }, randomUUID(), prisma)).rejects.toMatchObject({ code: "CARD_NOT_OWNED" });
    await prisma.marketplaceListing.create({ data: { cardInstanceId: data.second.id, sellerId: data.player.id, price: 50 } });
    await expect(sellToBank(data.player.id, { cardInstanceId: data.second.id }, randomUUID(), prisma)).rejects.toMatchObject({ code: "CARD_LISTED", status: 409 });
    await expect(sellToBank(data.player.id, { cardInstanceId: data.mine.id }, "pas-une-uuid", prisma)).rejects.toThrow();
    await expect(sellToBank(data.player.id, { cardInstanceId: data.mine.id, amount: 999999 }, randomUUID(), prisma)).rejects.toThrow();
    expect(await prisma.walletTransaction.count({ where: { walletId: data.player.id } })).toBe(0);
    expect((await prisma.cardInstance.findUniqueOrThrow({ where: { id: data.second.id } })).ownerId).toBe(data.player.id);
    const walletless = await fixture({ wallet: false });
    await expect(sellToBank(walletless.player.id, { cardInstanceId: walletless.mine.id }, randomUUID(), prisma)).rejects.toMatchObject({ code: "WALLET_NOT_FOUND" });
  });

  it("ne crédite qu’une seule fois une carte vendue deux fois en parallèle", async () => {
    const data = await fixture();
    const outcomes = await Promise.allSettled(Array.from({ length: 4 }, () =>
      sellToBank(data.player.id, { cardInstanceId: data.mine.id }, randomUUID(), prisma)));
    expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1);
    expect(outcomes.filter((outcome) => outcome.status === "rejected").map((outcome) => (outcome as PromiseRejectedResult).reason.code))
      .toEqual(["CARD_NOT_OWNED", "CARD_NOT_OWNED", "CARD_NOT_OWNED"]);
    expect((await prisma.wallet.findUniqueOrThrow({ where: { userId: data.player.id } })).balance).toBe(BigInt(700));
    expect(await prisma.walletTransaction.count({ where: { walletId: data.player.id } })).toBe(1);
  });
});

describe("Valeur des éditions", () => {
  it("suit le prestige recalculé et la surcharge administrateur, selon la valeur de rareté en base", async () => {
    const data = await fixture();
    const rarity = await prisma.rarityValue.findUniqueOrThrow({ where: { rarity: "LEGENDARY" } });
    await prisma.$transaction((tx) => recomputeSportPrestige(tx, data.sport.id, data.admin.id));
    // No honours: prestige 0, value = rarity value.
    expect((await prisma.cardEdition.findUniqueOrThrow({ where: { id: data.edition.id } })).baseValue).toBe(rarity.baseValue);
    await prisma.$transaction((tx) => updateAthlete(tx, data.athlete.id, { prestigeOverride: 50 }, data.admin.id));
    expect((await prisma.cardEdition.findUniqueOrThrow({ where: { id: data.edition.id } })).baseValue).toBe(rarity.baseValue * BigInt(150) / BigInt(100));
  });
});
