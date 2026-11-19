import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, type Prisma } from "@/generated/prisma/client";
import { listOpeningHistory } from "@/server/boosters/history";
import { grantBoostersToAll } from "@/server/admin/grants";
import { claimWelcomeBooster, discoveryBoosterId } from "@/server/game/catalog";
import { afterAll, describe, expect, it } from "vitest";

const connectionString = process.env.TEST_DATABASE_URL;
if (!connectionString) throw new Error("TEST_DATABASE_URL est obligatoire.");
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
afterAll(async () => prisma.$disconnect());
async function isolated(test: (tx: Prisma.TransactionClient) => Promise<void>) {
  const rollback = new Error("Annulation volontaire du scénario");
  await expect(prisma.$transaction(async (tx) => { await test(tx); throw rollback; }, { timeout: 30_000 })).rejects.toBe(rollback);
}
async function discoveryBooster(tx: Prisma.TransactionClient) {
  return tx.boosterType.upsert({ where: { id: discoveryBoosterId }, update: {}, create: { id: discoveryBoosterId, slug: `decouverte-${randomUUID()}`,
    nameFr: "Découverte multisport", category: "MULTISPORT", active: true } });
}

describe("Historique des ouvertures", () => {
  it("liste les ouvertures du joueur avec leurs cartes, leur devenir et des filtres sport et dates (Paris)", async () => isolated(async (tx) => {
    const player = await tx.user.create({ data: {} });
    const other = await tx.user.create({ data: {} });
    const booster = await discoveryBooster(tx);
    const football = await tx.sport.create({ data: { slug: randomUUID(), nameFr: "Football test", providerName: "F" } });
    const tennis = await tx.sport.create({ data: { slug: randomUUID(), nameFr: "Tennis test", providerName: "T" } });
    const athlete = await tx.athlete.create({ data: { name: "Athlète historique", sportId: football.id } });
    const edition = await tx.cardEdition.create({ data: { athleteId: athlete.id, name: "Or", rarity: "LEGENDARY" } });
    const open = (userId: string, sportId: string, openedAt: string, usedPassiveStock = true) => tx.boosterOpening.create({ data: {
      userId, boosterTypeId: booster.id, selectedSportId: sportId, usedPassiveStock, idempotencyKey: randomUUID(), configurationSnapshot: {}, openedAt: new Date(openedAt) } });
    // 23:30 UTC on 31 March is already 1 April in Paris (UTC+2).
    const late = await open(player.id, football.id, "2026-03-31T23:30:00Z", false);
    const early = await open(player.id, tennis.id, "2026-03-31T10:00:00Z");
    await open(other.id, football.id, "2026-03-31T12:00:00Z");
    const card = (ownerId: string | null, retired = false) => tx.cardInstance.create({ data: { editionId: edition.id, ownerId, openingId: late.id,
      acquisitionSource: "BOOSTER", ...(retired ? { retiredAt: new Date() } : {}) } });
    await card(player.id); await card(null, true); await card(other.id);

    const all = await listOpeningHistory(player.id, {}, tx as unknown as PrismaClient);
    expect(all.total).toBe(2);
    expect(all.openings.map((opening) => opening.id)).toEqual([late.id, early.id]);
    expect(all.openings[0]).toMatchObject({ source: "gift", sport: "Football test", booster: booster.nameFr });
    expect(all.openings[0]!.cards.map((row) => row.status)).toEqual(["owned", "sold-to-bank", "traded"]);
    expect(all.openings[1]).toMatchObject({ source: "passive", cards: [] });
    const filter = (input: object) => listOpeningHistory(player.id, input, tx as unknown as PrismaClient).then((result) => result.openings.map((opening) => opening.id));
    expect(await filter({ sportId: tennis.id })).toEqual([early.id]);
    expect(await filter({ from: "2026-04-01" })).toEqual([late.id]);
    expect(await filter({ to: "2026-03-31" })).toEqual([early.id]);
    expect(await filter({ from: "2026-03-31", to: "2026-03-31" })).toEqual([early.id]);
    await expect(listOpeningHistory(player.id, { from: "2026-04-02", to: "2026-04-01" }, tx as unknown as PrismaClient)).rejects.toThrow();
    await expect(listOpeningHistory(player.id, { userId: other.id }, tx as unknown as PrismaClient)).rejects.toThrow();
  }));
});

describe("Boosters offerts à tous les joueurs", () => {
  it("ajoute la quantité à chaque joueur, inclut le booster de bienvenue non récupéré et ne donne jamais deux fois", async () => isolated(async (tx) => {
    const admin = await tx.user.create({ data: { role: "ADMIN" } });
    const claimed = await tx.user.create({ data: {} });
    const fresh = await tx.user.create({ data: {} });
    const booster = await discoveryBooster(tx);
    await claimWelcomeBooster(tx, claimed.id);
    await tx.boosterInventory.update({ where: { userId_boosterTypeId: { userId: claimed.id, boosterTypeId: booster.id } }, data: { quantity: 0 } });
    const users = await tx.user.count();
    const key = randomUUID();
    expect(await grantBoostersToAll(tx, admin.id, { quantity: 10 }, key)).toEqual({ quantity: 10, players: users, replay: false });
    const quantity = async (userId: string) => (await tx.boosterInventory.findUniqueOrThrow({ where: { userId_boosterTypeId: { userId, boosterTypeId: booster.id } } })).quantity;
    expect(await quantity(claimed.id)).toBe(10);
    expect(await quantity(fresh.id)).toBe(11);
    // The welcome claim is now a no-op: the inventory row already exists.
    expect(await claimWelcomeBooster(tx, fresh.id)).toEqual({ quantity: 11 });
    expect(await grantBoostersToAll(tx, admin.id, { quantity: 10 }, key)).toMatchObject({ replay: true, players: users });
    expect(await quantity(fresh.id)).toBe(11);
    await expect(grantBoostersToAll(tx, admin.id, { quantity: 5 }, key)).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
    expect(await tx.adminAuditLog.count({ where: { action: "BOOSTER_GRANT", entityId: key } })).toBe(1);
  }));

  it("refuse un non-administrateur, une quantité invalide et une clé invalide", async () => isolated(async (tx) => {
    const admin = await tx.user.create({ data: { role: "ADMIN" } });
    const player = await tx.user.create({ data: {} });
    await discoveryBooster(tx);
    await expect(grantBoostersToAll(tx, player.id, { quantity: 10 }, randomUUID())).rejects.toMatchObject({ status: 403 });
    for (const quantity of [0, -1, 101, 2.5]) await expect(grantBoostersToAll(tx, admin.id, { quantity }, randomUUID())).rejects.toThrow();
    await expect(grantBoostersToAll(tx, admin.id, { quantity: 10 }, "pas-une-cle")).rejects.toThrow();
    expect(await tx.adminAuditLog.count({ where: { action: "BOOSTER_GRANT", actorId: admin.id } })).toBe(0);
  }));
});
