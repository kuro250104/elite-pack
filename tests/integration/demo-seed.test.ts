import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, type Prisma } from "@/generated/prisma/client";
import { demoOperatorId, seedDemoCatalogue } from "@/server/game/demo-seed";
import { afterAll, describe, expect, it } from "vitest";

const connectionString = process.env.TEST_DATABASE_URL;
if (!connectionString) throw new Error("TEST_DATABASE_URL est obligatoire pour les données de démonstration.");
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
afterAll(async () => prisma.$disconnect());

class Rollback extends Error {}
/** Runs the scenario in a transaction that is always rolled back: the shared test database is left unchanged. */
async function inRolledBackTransaction(scenario: (tx: Prisma.TransactionClient) => Promise<void>) {
  await expect(prisma.$transaction(async (tx) => { await scenario(tx); throw new Rollback(); }, { timeout: 30_000 })).rejects.toBeInstanceOf(Rollback);
}

describe("données de démonstration", () => {
  it("charge un catalogue jouable par le vrai chemin d’import, de façon idempotente", async () => {
    await inRolledBackTransaction(async (tx) => {
      const first = await seedDemoCatalogue(tx);
      expect(first.catalogue).toMatchObject({ boosterId: "discovery-booster", athletes: 2, sports: 2, preparedEditions: 12 });

      const second = await seedDemoCatalogue(tx);
      expect(second.athletes.every((athlete) => athlete.action === "existing")).toBe(true);
      expect(second.catalogue.preparedEditions).toBe(12);

      const identities = await tx.athleteExternalId.findMany({ where: { provider: "THESPORTSDB", externalId: { in: ["34162098", "34157136"] } },
        include: { athlete: { include: { sport: true } } } });
      expect(identities).toHaveLength(2);
      expect(identities.every(({ athlete }) => athlete.active && athlete.sport.active)).toBe(true);
      expect(new Set(identities.map(({ athlete }) => athlete.sport.nameFr)).size).toBe(2);

      const booster = await tx.boosterType.findUniqueOrThrow({ where: { id: "discovery-booster" }, include: { editions: true, sports: true } });
      expect(booster.active).toBe(true);
      expect(booster.editions).toHaveLength(12);
      expect(booster.sports).toHaveLength(2);

      const operator = await tx.user.findUniqueOrThrow({ where: { id: demoOperatorId } });
      expect(operator.role).toBe("ADMIN");
      expect(operator.email).toBeNull();
      expect(operator.passwordHash).toBeNull();
    });
  });
});
