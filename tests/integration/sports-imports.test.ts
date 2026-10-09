import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, type Prisma } from "@/generated/prisma/client";
import { importSports, updateSport } from "@/server/sports/service";
import { afterAll, describe, expect, it } from "vitest";

const connectionString = process.env.TEST_DATABASE_URL;
if (!connectionString) throw new Error("TEST_DATABASE_URL est obligatoire pour les imports sportifs.");
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
afterAll(async () => prisma.$disconnect());
const providerId = () => BigInt(`0x${randomUUID().replaceAll("-", "").slice(0, 15)}`).toString();

async function isolated(test: (tx: Prisma.TransactionClient) => Promise<void>) {
  const rollback = new Error("Annulation volontaire du test sportif");
  await expect(prisma.$transaction(async (tx) => {
    await test(tx);
    throw rollback;
  })).rejects.toBe(rollback);
}

describe("Catalogue sportif importé", () => {
  it("traduit Soccer et désactive les sports inconnus", async () => {
    await isolated(async (tx) => {
      const admin = await tx.user.create({ data: { role: "ADMIN" } });
      const soccerId = providerId();
      const unknownId = providerId();
      expect(await importSports(tx, [
        { externalId: soccerId, providerName: "Soccer", category: "Team" },
        { externalId: unknownId, providerName: `Sport inconnu ${randomUUID()}`, category: null },
      ], admin.id)).toEqual({ processed: 2, created: 2 });
      expect(await tx.sport.findUniqueOrThrow({ where: { providerId: soccerId } })).toMatchObject({ nameFr: "Football", active: false });
      expect(await tx.sport.findUniqueOrThrow({ where: { providerId: unknownId } })).toMatchObject({ nameFr: `Sport à traduire (${unknownId})`, active: false });
      expect(await tx.adminAuditLog.count({ where: { actorId: admin.id, action: "IMPORT_SPORTS" } })).toBe(1);
    });
  });

  it("préserve traduction, activation et icône administratives au réimport", async () => {
    await isolated(async (tx) => {
      const admin = await tx.user.create({ data: { role: "ADMIN" } });
      const externalId = providerId();
      const payload = { externalId, providerName: "Soccer", category: "Team" };
      await importSports(tx, [payload], admin.id);
      const sport = await tx.sport.findUniqueOrThrow({ where: { providerId: externalId } });
      await updateSport(tx, sport.id, { nameFr: "Football personnalisé", active: true }, admin.id);
      await tx.sport.update({ where: { id: sport.id }, data: { icon: "trophy" } });
      expect(await importSports(tx, [{ ...payload, providerName: "SOCCER", category: "Collectif" }], admin.id)).toEqual({ processed: 1, created: 0 });
      expect(await tx.sport.findUniqueOrThrow({ where: { id: sport.id } })).toMatchObject({ nameFr: "Football personnalisé", active: true, icon: "trophy", providerName: "SOCCER", category: "Collectif" });
      expect(await tx.sport.count({ where: { providerId: externalId } })).toBe(1);
    });
  });

  it("refuse PLAYER et l'activation d'un sport sans traduction", async () => {
    await isolated(async (tx) => {
      const admin = await tx.user.create({ data: { role: "ADMIN" } });
      const player = await tx.user.create({ data: {} });
      const payload = { externalId: providerId(), providerName: `Inconnu ${randomUUID()}`, category: null };
      await expect(importSports(tx, [payload], player.id)).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
      expect(await tx.sport.count({ where: { providerId: payload.externalId } })).toBe(0);
      await importSports(tx, [payload], admin.id);
      const sport = await tx.sport.findUniqueOrThrow({ where: { providerId: payload.externalId } });
      await expect(updateSport(tx, sport.id, { nameFr: "Sport corrigé" }, player.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(updateSport(tx, sport.id, { active: true }, admin.id)).rejects.toMatchObject({ code: "TRANSLATION_REQUIRED", status: 400 });
      expect((await tx.sport.findUniqueOrThrow({ where: { id: sport.id } })).active).toBe(false);
      expect(await updateSport(tx, sport.id, { nameFr: "Sport corrigé", active: true }, admin.id)).toMatchObject({ nameFr: "Sport corrigé", active: true });
    });
  });

  it("déduplique deux imports simultanés du même identifiant fournisseur", async () => {
    const externalId = providerId();
    const admin = await prisma.user.create({ data: { role: "ADMIN" } });
    const payload = { externalId, providerName: "Soccer", category: null };
    try {
      const results = await Promise.all([
        prisma.$transaction((tx) => importSports(tx, [payload], admin.id)),
        prisma.$transaction((tx) => importSports(tx, [payload], admin.id)),
      ]);
      expect(results.map((result) => result.created).sort()).toEqual([0, 1]);
      expect(await prisma.sport.count({ where: { providerId: externalId } })).toBe(1);
    } finally {
      await prisma.$transaction(async (tx) => {
        await tx.adminAuditLog.deleteMany({ where: { actorId: admin.id } });
        await tx.sport.deleteMany({ where: { providerId: externalId } });
        await tx.user.delete({ where: { id: admin.id } });
      });
    }
  });
});
