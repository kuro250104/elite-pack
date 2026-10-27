import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, type Prisma } from "@/generated/prisma/client";
import { syncPassiveBoosters, consumePassiveBooster } from "@/server/boosters/passive";
import { afterAll, describe, expect, it } from "vitest";
const url = process.env.TEST_DATABASE_URL;
if (!url) throw new Error("TEST_DATABASE_URL est obligatoire.");
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
afterAll(async () => db.$disconnect());
const rollback = new Error("Annulation volontaire");
async function isolated(scenario: (tx: Prisma.TransactionClient) => Promise<void>) {
  try { await db.$transaction(async (tx) => { await scenario(tx); throw rollback; }); }
  catch (error) { if (error !== rollback) throw error; }
}
async function player(tx: Prisma.TransactionClient) {
  await tx.gameConfiguration.update({ where: { id: "default" }, data: { passiveIntervalSeconds: 900, passiveMaxStock: 10 } });
  return tx.user.create({ data: { name: `Passif ${randomUUID()}` } });
}
describe("stock passif PostgreSQL", () => {
  it("crée le nouvel état à zéro avec un cycle frais", async () => isolated(async tx => {
    const user = await player(tx);
    const state = await syncPassiveBoosters(tx, user.id);
    expect(state.stock).toBe(0);
    expect(state.nextGenerationAt!.getTime() - state.serverTime.getTime()).toBeGreaterThan(899_000);
    expect(state.nextGenerationAt!.getTime() - state.serverTime.getTime()).toBeLessThanOrEqual(900_000);
  }));
  it.each([[0, 1], [2700, 4], [85500, 10]])("accumule un retard de %s secondes avec %s boosters", async (delay, expected) => isolated(async tx => {
    const user = await player(tx);
    await tx.$executeRaw`INSERT INTO "PassiveBoosterState" ("userId",stock,"nextGenerationAt","generatedTotal","updatedAt") VALUES (${user.id},0,clock_timestamp()-${delay}*interval '1 second',0,clock_timestamp())`;
    const snapshot = await syncPassiveBoosters(tx, user.id);
    expect(snapshot.stock).toBe(expected);
    const stored = await tx.passiveBoosterState.findUniqueOrThrow({ where: { userId: user.id } });
    expect(stored.generatedTotal).toBe(BigInt(expected));
    expect(expected === 10 ? snapshot.nextGenerationAt === null : snapshot.nextGenerationAt !== null).toBe(true);
  }));
  it("fait une pause au plafond puis redémarre après consommation", async () => isolated(async tx => {
    const user = await player(tx);
    await tx.passiveBoosterState.create({ data: { userId: user.id, stock: 10, nextGenerationAt: null, generatedTotal: 10n } });
    expect((await syncPassiveBoosters(tx, user.id)).nextGenerationAt).toBeNull();
    const snapshot = await consumePassiveBooster(tx, user.id);
    expect(snapshot.stock).toBe(9);
    expect(snapshot.nextGenerationAt!.getTime() - snapshot.serverTime.getTime()).toBe(900_000);
    const next = snapshot.nextGenerationAt;
    const second = await consumePassiveBooster(tx, user.id);
    expect(second.stock).toBe(8);
    expect(second.nextGenerationAt).toEqual(next);
    expect((await tx.passiveBoosterState.findUniqueOrThrow({ where: { userId: user.id } })).generatedTotal).toBe(10n);
  }));
  it("préserve les huit minutes restantes lors d’un débit partiel", async () => isolated(async tx => {
    const user = await player(tx);
    const next = new Date(Date.now() + 480_000);
    await tx.passiveBoosterState.create({ data: { userId: user.id, stock: 4, nextGenerationAt: next } });
    expect(await consumePassiveBooster(tx, user.id)).toMatchObject({ stock: 3, nextGenerationAt: next });
  }));
  it("refuse un stock vide et un joueur absent", async () => isolated(async tx => {
    const user = await player(tx);
    await expect(consumePassiveBooster(tx, user.id)).rejects.toMatchObject({ code: "NO_PASSIVE_BOOSTER" });
    await expect(syncPassiveBoosters(tx, randomUUID())).rejects.toMatchObject({ code: "USER_NOT_FOUND" });
  }));
  it("ne débite qu’une fois face à deux transactions concurrentes", async () => {
    const user = await db.user.create({ data: { name: `Passif concurrence ${randomUUID()}` } });
    try {
      await db.passiveBoosterState.create({ data: { userId: user.id, stock: 1, nextGenerationAt: new Date(Date.now() + 600_000) } });
      const results = await Promise.allSettled([
        db.$transaction(tx => consumePassiveBooster(tx, user.id)),
        db.$transaction(tx => consumePassiveBooster(tx, user.id)),
      ]);
      expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
      const failure = results.find(result => result.status === "rejected");
      expect(failure?.status === "rejected" ? failure.reason : null).toMatchObject({ code: "NO_PASSIVE_BOOSTER" });
      expect((await db.passiveBoosterState.findUniqueOrThrow({ where: { userId: user.id } })).stock).toBe(0);
    } finally {
      await db.$transaction(async tx => {
        await tx.passiveBoosterState.deleteMany({ where: { userId: user.id } });
        await tx.user.delete({ where: { id: user.id } });
      });
    }
  });
});
