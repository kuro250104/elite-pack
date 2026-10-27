import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { claimWelcomeBooster } from "@/server/game/catalog";
import { afterAll, describe, expect, it } from "vitest";

const connectionString = process.env.TEST_DATABASE_URL;
if (!connectionString) throw new Error("TEST_DATABASE_URL est obligatoire pour le booster de bienvenue.");
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
afterAll(async () => prisma.$disconnect());

describe("Reçu unique du booster de bienvenue", () => {
  it("refuse un joueur inexistant sans créer de reçu", async () => {
    const rollback = new Error("Annulation du test de bienvenue");
    await expect(prisma.$transaction(async (tx) => {
      await expect(claimWelcomeBooster(tx, "welcome-absent-player", randomUUID())).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
      expect(await tx.boosterInventory.count({ where: { userId: "welcome-absent-player" } })).toBe(0);
      throw rollback;
    })).rejects.toBe(rollback);
  });

  it("attribue une seule fois malgré deux demandes concurrentes et ne renouvelle pas après consommation", async () => {
    // Committed, uniquely scoped fixtures are necessary for independent transactions.
    const booster = await prisma.boosterType.create({ data: { slug: `bienvenue-${randomUUID()}`, nameFr: "Bienvenue de test", category: "MULTISPORT", active: true } });
    const boosterTypeId = booster.id;
    const user = await prisma.user.create({ data: {} });
    try {
      const results = await Promise.all([
        prisma.$transaction((tx) => claimWelcomeBooster(tx, user.id, boosterTypeId)),
        prisma.$transaction((tx) => claimWelcomeBooster(tx, user.id, boosterTypeId)),
      ]);
      expect(results).toEqual([{ quantity: 1 }, { quantity: 1 }]);
      expect(await prisma.boosterInventory.count({ where: { userId: user.id, boosterTypeId } })).toBe(1);
      const consumed = await prisma.boosterInventory.updateMany({ where: {
        userId: user.id, boosterTypeId, quantity: { gt: 0 },
      }, data: { quantity: { decrement: 1 } } });
      expect(consumed.count).toBe(1);
      const afterConsumption = await prisma.$transaction((tx) => claimWelcomeBooster(tx, user.id, boosterTypeId));
      expect(afterConsumption).toEqual({ quantity: 0 });
      expect(await prisma.boosterInventory.findUniqueOrThrow({ where: {
        userId_boosterTypeId: { userId: user.id, boosterTypeId },
      } })).toMatchObject({ quantity: 0 });
    } finally {
      // Only this test's own account, receipt and booster are removed; the shared catalogue is preserved.
      await prisma.$transaction(async (tx) => {
        await tx.boosterInventory.deleteMany({ where: { userId: user.id } });
        await tx.user.delete({ where: { id: user.id } });
        await tx.boosterType.delete({ where: { id: booster.id } });
      });
    }
  });
});
