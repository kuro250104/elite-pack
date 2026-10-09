import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, type Prisma } from "@/generated/prisma/client";
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { consumeRateLimit, deferRateLimit } from "@/server/security/rate-limit";

const url = process.env.TEST_DATABASE_URL;
if (!url) throw new Error("TEST_DATABASE_URL est obligatoire pour les quotas PostgreSQL.");
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
const rollback = new Error("Annulation volontaire de la transaction de test");

beforeAll(async () => prisma.$connect());
afterAll(async () => prisma.$disconnect());

// Tout état créé par un scénario est annulé, sans nettoyage global.
async function isolated(test: (tx: Prisma.TransactionClient) => Promise<void>) {
  try {
    await prisma.$transaction(async (tx) => {
      await test(tx);
      throw rollback;
    });
  } catch (error) {
    if (error !== rollback) throw error;
  }
}

describe("Quota PostgreSQL partagé", () => {
  it("n'autorise que deux réservations parmi cinq transactions concurrentes", async () => {
    const key = `test-concurrency:${randomUUID()}`;
    try {
      const results = await Promise.allSettled(Array.from({ length: 5 }, () =>
        prisma.$transaction((tx) => consumeRateLimit(tx, key, { limit: 2, windowSeconds: 60 })),
      ));
      expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(2);
      const rejected = results.filter((result) => result.status === "rejected");
      expect(rejected).toHaveLength(3);
      for (const result of rejected) {
        if (result.status === "rejected") expect(result.reason).toMatchObject({ status: 429 });
      }
      expect((await prisma.rateLimitBucket.findUniqueOrThrow({ where: { key } })).count).toBe(2);
    } finally {
      // Seule la clé aléatoire propre à ce scénario concurrent est supprimée.
      await prisma.rateLimitBucket.deleteMany({ where: { key } });
    }
  });

  it("partage un délai fournisseur et ne le raccourcit pas", async () => {
    await isolated(async (tx) => {
      const key = randomUUID();
      await deferRateLimit(tx, key, 60);
      const first = await tx.rateLimitBucket.findUniqueOrThrow({ where: { key } });
      await deferRateLimit(tx, key, 1);
      const second = await tx.rateLimitBucket.findUniqueOrThrow({ where: { key } });
      expect(second.nextAllowedAt).toEqual(first.nextAllowedAt);
      await expect(consumeRateLimit(tx, key, { limit: 30, windowSeconds: 60 })).rejects.toMatchObject({ status: 429 });
    });
  });

  it("réserve le quota puis rejette le dépassement sans incrémenter", async () => {
    await isolated(async (tx) => {
      const key = randomUUID();
      await consumeRateLimit(tx, key, { limit: 2, windowSeconds: 60 });
      await consumeRateLimit(tx, key, { limit: 2, windowSeconds: 60 });
      await expect(consumeRateLimit(tx, key, { limit: 2, windowSeconds: 60 })).rejects.toMatchObject({ status: 429 });
      const bucket = await tx.rateLimitBucket.findUniqueOrThrow({ where: { key } });
      expect(bucket.count).toBe(2);
    });
  });

  it("recommence une fenêtre expirée selon l'horloge PostgreSQL", async () => {
    await isolated(async (tx) => {
      const key = randomUUID();
      await tx.$executeRaw`INSERT INTO "RateLimitBucket" ("key","windowStart","count") VALUES (${key},clock_timestamp()-interval '2 minutes',3)`;
      await consumeRateLimit(tx, key, { limit: 3, windowSeconds: 60 });
      expect((await tx.rateLimitBucket.findUniqueOrThrow({ where: { key } })).count).toBe(1);
    });
  });

  it("espace les requêtes indépendamment du nombre disponible", async () => {
    await isolated(async (tx) => {
      const key = randomUUID();
      await consumeRateLimit(tx, key, { limit: 10, windowSeconds: 60, minIntervalMs: 5000 });
      await expect(consumeRateLimit(tx, key, { limit: 10, windowSeconds: 60, minIntervalMs: 5000 })).rejects.toMatchObject({ status: 429 });
      expect((await tx.rateLimitBucket.findUniqueOrThrow({ where: { key } })).count).toBe(1);
    });
  });

  it("conserve le délai minimal à travers une nouvelle fenêtre", async () => {
    await isolated(async (tx) => {
      const key = randomUUID();
      await tx.$executeRaw`INSERT INTO "RateLimitBucket" ("key","windowStart","count","nextAllowedAt") VALUES (${key},clock_timestamp()-interval '2 minutes',3,clock_timestamp()+interval '30 seconds')`;
      await expect(consumeRateLimit(tx, key, { limit: 3, windowSeconds: 60 })).rejects.toMatchObject({ status: 429 });
    });
  });
});
