import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { createPlayer } from "@/server/players/create-player";
import { afterAll, describe, expect, it } from "vitest";
const connectionString = process.env.TEST_DATABASE_URL;
if (!connectionString) throw new Error("TEST_DATABASE_URL est obligatoire.");
const prisma = new PrismaClient({adapter: new PrismaPg({connectionString})});
afterAll(async () => prisma.$disconnect());
describe("création atomique du joueur", () => {
  it("initialise compte, journal et cycle passif, puis annule toute la transaction", async () => {
    const email = `test-${randomUUID()}@example.invalid`;
    const rollback = new Error("Annulation volontaire du scénario");
    await expect(prisma.$transaction(async (tx) => {
      const config = await tx.gameConfiguration.findUniqueOrThrow({where: {id: "default"}});
      const before = Date.now();
      const player = await createPlayer(tx, {id: "ignored-external-id", email, emailVerified: null, name: "Test"});
      expect(player.id).not.toBe("ignored-external-id");
      expect(player.role).toBe("PLAYER");
      const wallet = await tx.wallet.findUniqueOrThrow({where: {userId: player.id}, include: {transactions: true}});
      expect(wallet.balance).toBe(config.startingBalance);
      expect(wallet.transactions).toHaveLength(1);
      expect(wallet.transactions[0]).toMatchObject({type: "INITIAL_BALANCE", amount: config.startingBalance});
      const passive = await tx.passiveBoosterState.findUniqueOrThrow({where: {userId: player.id}});
      expect(passive.stock).toBe(0);
      expect(passive.nextGenerationAt?.getTime()).toBeGreaterThanOrEqual(before + config.passiveIntervalSeconds * 1000);
      expect(passive.nextGenerationAt?.getTime()).toBeLessThanOrEqual(Date.now() + config.passiveIntervalSeconds * 1000);
      throw rollback;
    })).rejects.toBe(rollback);
    expect(await prisma.user.findUnique({where: {email}})).toBeNull();
  });
});
