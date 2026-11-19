import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, type Prisma } from "@/generated/prisma/client";
import { mintCardInstance } from "@/server/cards/service";
import { afterAll, describe, expect, it } from "vitest";
const connectionString = process.env.TEST_DATABASE_URL;
if (!connectionString) throw new Error("TEST_DATABASE_URL est obligatoire pour la frappe d’exemplaires.");
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
afterAll(async () => prisma.$disconnect());
async function fixture(tx: Prisma.TransactionClient, maxSupply: number | null = null, players = 2) {
  const users = await Promise.all(Array.from({ length: players }, () => tx.user.create({ data: {} })));
  const sport = await tx.sport.create({ data: { slug: randomUUID(), nameFr: "Sport de test", providerName: "Test", active: true } });
  const athlete = await tx.athlete.create({ data: { name: "Athlète de test", sportId: sport.id, active: true } });
  const edition = await tx.cardEdition.create({ data: { athleteId: athlete.id, name: "Standard", rarity: "COMMON", active: true, maxSupply } });
  return { users, user: users[0]!, otherUser: users[1]!, sport, athlete, edition };
}
async function isolated(test: (tx: Prisma.TransactionClient) => Promise<void>) {
  const rollback = new Error("Annulation volontaire du scénario de frappe");
  await expect(prisma.$transaction(async (tx) => { await test(tx); throw rollback; }, { timeout: 15000 })).rejects.toBe(rollback);
}
async function cleanup(data: Awaited<ReturnType<typeof fixture>>) {
  // Only this test's own UUID-scoped records are removed; no shared data is reset.
  await prisma.$transaction(async (tx) => {
    await tx.cardInstance.deleteMany({ where: { editionId: data.edition.id } });
    await tx.cardDiscovery.deleteMany({ where: { editionId: data.edition.id } });
    await tx.cardEdition.delete({ where: { id: data.edition.id } });
    await tx.athlete.delete({ where: { id: data.athlete.id } });
    await tx.sport.delete({ where: { id: data.sport.id } });
    await tx.user.deleteMany({ where: { id: { in: data.users.map((user) => user.id) } } });
  });
}

describe("Frappe transactionnelle", () => {
  it("autorise les doublons illimités et conserve une découverte unique", async () => isolated(async (tx) => {
    const data = await fixture(tx);
    const first = await mintCardInstance(tx, data.edition.id, data.user.id, undefined, "ADMIN");
    const second = await mintCardInstance(tx, data.edition.id, data.user.id, undefined, "ADMIN");
    expect(first.id).not.toBe(second.id);
    expect(first).toMatchObject({ ownerId: data.user.id, serialNumber: null, acquisitionSource: "ADMIN" });
    expect((await tx.cardEdition.findUniqueOrThrow({ where: { id: data.edition.id } })).mintedSupply).toBe(2);
    expect(await tx.cardDiscovery.count({ where: { userId: data.user.id, editionId: data.edition.id } })).toBe(1);
  }));
  it("donne à chaque joueur ses propres exemplaires d’une même édition", async () => isolated(async (tx) => {
    const data = await fixture(tx);
    const mine = await mintCardInstance(tx, data.edition.id, data.user.id);
    const theirs = await mintCardInstance(tx, data.edition.id, data.otherUser.id);
    expect(mine.ownerId).toBe(data.user.id);
    expect(theirs.ownerId).toBe(data.otherUser.id);
    expect(await tx.cardDiscovery.count({ where: { editionId: data.edition.id } })).toBe(2);
  }));
  it("interdit un exemplaire retiré qui conserverait un propriétaire", async () => isolated(async (tx) => {
    const data = await fixture(tx);
    const card = await mintCardInstance(tx, data.edition.id, data.user.id);
    await tx.$executeRawUnsafe("SAVEPOINT retired_owner");
    await expect(tx.cardInstance.update({ where: { id: card.id }, data: { retiredAt: new Date() } })).rejects.toThrow();
    await tx.$executeRawUnsafe("ROLLBACK TO SAVEPOINT retired_owner");
    await tx.cardInstance.update({ where: { id: card.id }, data: { retiredAt: new Date(), ownerId: null } });
    expect(await tx.cardDiscovery.count({ where: { userId: data.user.id, editionId: data.edition.id } })).toBe(1);
  }));
  it("attribue le numéro limité et refuse de dépasser le tirage", async () => isolated(async (tx) => {
    const data = await fixture(tx, 1);
    expect(await mintCardInstance(tx, data.edition.id, data.user.id)).toMatchObject({ serialNumber: 1 });
    await expect(mintCardInstance(tx, data.edition.id, data.otherUser.id)).rejects.toMatchObject({ code: "EDITION_UNAVAILABLE" });
    expect(await tx.cardInstance.count({ where: { editionId: data.edition.id } })).toBe(1);
  }));
  it("refuse une édition future, inactive, un sport désactivé et un propriétaire absent", async () => isolated(async (tx) => {
    const data = await fixture(tx);
    await tx.cardEdition.update({ where: { id: data.edition.id }, data: { releaseDate: new Date(Date.now() + 60000) } });
    await expect(mintCardInstance(tx, data.edition.id, data.user.id)).rejects.toMatchObject({ code: "EDITION_UNAVAILABLE" });
    await tx.cardEdition.update({ where: { id: data.edition.id }, data: { releaseDate: new Date(0), active: false } });
    await expect(mintCardInstance(tx, data.edition.id, data.user.id)).rejects.toMatchObject({ code: "EDITION_UNAVAILABLE" });
    await tx.cardEdition.update({ where: { id: data.edition.id }, data: { active: true } });
    await expect(mintCardInstance(tx, data.edition.id, randomUUID())).rejects.toMatchObject({ code: "PLAYER_NOT_FOUND" });
    await expect(mintCardInstance(tx, randomUUID(), data.user.id)).rejects.toMatchObject({ code: "EDITION_UNAVAILABLE" });
    await tx.sport.update({ where: { id: data.sport.id }, data: { active: false } });
    await expect(mintCardInstance(tx, data.edition.id, data.user.id)).rejects.toMatchObject({ code: "EDITION_UNAVAILABLE" });
    expect((await tx.cardEdition.findUniqueOrThrow({ where: { id: data.edition.id } })).mintedSupply).toBe(0);
  }));
});

describe("Frappe concurrente", () => {
  it("empêche des frappes simultanées de dépasser une édition limitée", async () => {
    const data = await prisma.$transaction((tx) => fixture(tx, 3, 6));
    try {
      const results = await Promise.allSettled(data.users.map((user) =>
        prisma.$transaction((tx) => mintCardInstance(tx, data.edition.id, user.id, undefined, "ADMIN"))));
      expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(3);
      for (const result of results) {
        if (result.status === "rejected") expect(result.reason).toMatchObject({ code: "EDITION_UNAVAILABLE" });
      }
      expect((await prisma.cardEdition.findUniqueOrThrow({ where: { id: data.edition.id } })).mintedSupply).toBe(3);
      const cards = await prisma.cardInstance.findMany({ where: { editionId: data.edition.id } });
      expect(cards.map((card) => card.serialNumber).sort()).toEqual([1, 2, 3]);
    } finally { await cleanup(data); }
  });
  it("frappe sans perte les éditions illimitées sollicitées simultanément", async () => {
    const data = await prisma.$transaction((tx) => fixture(tx, null, 4));
    try {
      await Promise.all(data.users.flatMap((user) => [user, user].map(() =>
        prisma.$transaction((tx) => mintCardInstance(tx, data.edition.id, user.id)))));
      expect((await prisma.cardEdition.findUniqueOrThrow({ where: { id: data.edition.id } })).mintedSupply).toBe(8);
      expect(await prisma.cardInstance.count({ where: { editionId: data.edition.id, serialNumber: null } })).toBe(8);
      expect(await prisma.cardDiscovery.count({ where: { editionId: data.edition.id } })).toBe(4);
    } finally { await cleanup(data); }
  });
});
