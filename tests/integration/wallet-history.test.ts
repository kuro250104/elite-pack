import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, expect, it } from "vitest";
import { PrismaClient } from "@/generated/prisma/client";
import { getWalletHistory } from "@/server/wallet/history";

const connectionString = process.env.TEST_DATABASE_URL;
if (!connectionString) throw new Error("TEST_DATABASE_URL est obligatoire pour l’historique du portefeuille.");
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
afterAll(() => prisma.$disconnect());

it("isole les joueurs, résout les détails et conserve la précision et l’ordre sur chaque page", async () => {
  const key = randomUUID();
  const date = new Date("2026-11-20T09:00:00.000Z");
  const balance = 9007199254740993n;
  const data = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({ data: {} });
    const other = await tx.user.create({ data: {} });
    await tx.wallet.createMany({ data: [
      { userId: user.id, balance, lifetimeEarnings: balance + 50n, lifetimeSpending: 50n },
      { userId: other.id, balance: 80n },
    ] });
    const sport = await tx.sport.create({ data: { slug: key, nameFr: "Sport de test", providerName: "Test" } });
    const athlete = await tx.athlete.create({ data: { sportId: sport.id, name: "Athlète de test" } });
    const edition = await tx.cardEdition.create({ data: { athleteId: athlete.id, name: "Édition de test", rarity: "RARE" } });
    const card = await tx.cardInstance.create({ data: { editionId: edition.id, ownerId: user.id, acquisitionSource: "ADMIN" } });
    const retired = await tx.cardInstance.create({ data: { editionId: edition.id, retiredAt: date, acquisitionSource: "ADMIN" } });
    const listing = await tx.marketplaceListing.create({ data: {
      cardInstanceId: card.id, sellerId: other.id, buyerId: user.id, status: "SOLD", closedAt: date, price: 50n,
    } });
    const booster = await tx.boosterType.create({ data: { slug: key, category: "EVENT", nameFr: "Booster de test" } });
    const common = { walletId: user.id, balanceAfter: balance, createdAt: date };
    await tx.walletTransaction.createMany({ data: [
      { ...common, id: `${key}-1`, idempotencyKey: "start", type: "INITIAL_BALANCE", amount: balance },
      { ...common, id: `${key}-2`, idempotencyKey: "bank", type: "BANK_SALE", amount: 75n, referenceId: retired.id },
      { ...common, id: `${key}-3`, idempotencyKey: "purchase", type: "MARKETPLACE_PURCHASE", amount: -50n, referenceId: listing.id },
      { ...common, id: `${key}-4`, idempotencyKey: "sale", type: "MARKETPLACE_SALE", amount: 50n, referenceId: listing.id },
      { ...common, id: `${key}-5`, idempotencyKey: "booster", type: "BOOSTER_PURCHASE", amount: -25n, referenceId: booster.id, metadata: { private: true } },
      { ...common, id: `${key}-0`, idempotencyKey: "missing", type: "BANK_SALE", amount: 20n, referenceId: "introuvable",
        createdAt: new Date(date.getTime() + 1000) },
      { ...common, id: `${key}-other`, walletId: other.id, idempotencyKey: "other", type: "REWARD", amount: 80n, balanceAfter: 80n },
    ] });
    return { user, other, sport, athlete, edition, card, retired, listing, booster };
  });
  try {
    const history = await getWalletHistory(data.user.id, { pageSize: 3 }, prisma);
    expect(history).toMatchObject({
      balance: String(balance), lifetimeEarnings: String(balance + 50n), lifetimeSpending: "50", total: 6, page: 1, pageSize: 3,
    });
    expect(history.transactions.map(({ id, detail }) => [id, detail])).toEqual([
      [`${key}-0`, null], [`${key}-5`, "Booster de test"], [`${key}-4`, "Athlète de test — Édition de test"],
    ]);
    const second = await getWalletHistory(data.user.id, { page: 2, pageSize: 3 }, prisma);
    expect(second.transactions.map(({ id, detail }) => [id, detail])).toEqual([
      [`${key}-3`, "Athlète de test — Édition de test"], [`${key}-2`, "Athlète de test — Édition de test"], [`${key}-1`, null],
    ]);
    expect(second.transactions[0]?.amount).toBe("-50");
    expect(Object.keys(history.transactions[1] ?? {}).sort()).toEqual(
      ["id", "type", "label", "detail", "amount", "balanceAfter", "createdAt"].sort(),
    );
    expect(() => JSON.stringify(history)).not.toThrow();
    const filtered = await getWalletHistory(data.user.id, { type: "BANK_SALE", page: 2, pageSize: 1 }, prisma);
    expect(filtered).toMatchObject({ total: 2, transactions: [{ id: `${key}-2`, label: "Revente à la banque" }] });
    const other = await getWalletHistory(data.other.id, {}, prisma);
    expect(other).toMatchObject({ balance: "80", total: 1, transactions: [{ id: `${key}-other` }] });
    await expect(getWalletHistory(data.user.id, { type: "INCONNU" }, prisma)).rejects.toMatchObject({ name: "ZodError" });
    await expect(getWalletHistory(randomUUID(), {}, prisma)).rejects.toMatchObject({ code: "WALLET_NOT_FOUND", status: 404 });
  } finally {
    await prisma.$transaction(async (tx) => {
      const users = { in: [data.user.id, data.other.id] };
      await tx.walletTransaction.deleteMany({ where: { walletId: users } });
      await tx.wallet.deleteMany({ where: { userId: users } });
      await tx.marketplaceListing.delete({ where: { id: data.listing.id } });
      await tx.cardInstance.deleteMany({ where: { id: { in: [data.card.id, data.retired.id] } } });
      await tx.cardEdition.delete({ where: { id: data.edition.id } });
      await tx.athlete.delete({ where: { id: data.athlete.id } });
      await tx.sport.delete({ where: { id: data.sport.id } });
      await tx.boosterType.delete({ where: { id: data.booster.id } });
      await tx.user.deleteMany({ where: { id: users } });
    });
  }
});
