import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { Rarity } from "../src/generated/prisma/enums";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL est nécessaire pour initialiser la base.");
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

// Valeurs initiales uniquement : les prochains seeds préservent les réglages administratifs.
const defaults: Array<{ rarity: Rarity; weightBasisPoints: number }> = [
  { rarity: Rarity.COMMON, weightBasisPoints: 5500 },
  { rarity: Rarity.UNCOMMON, weightBasisPoints: 2500 },
  { rarity: Rarity.RARE, weightBasisPoints: 1200 },
  { rarity: Rarity.EPIC, weightBasisPoints: 500 },
  { rarity: Rarity.LEGENDARY, weightBasisPoints: 250 },
  { rarity: Rarity.MYTHIC, weightBasisPoints: 50 },
];

async function main() {
  await prisma.$transaction(async (tx) => {
    await tx.gameConfiguration.upsert({
      where: { id: "default" }, update: {}, create: { id: "default" },
    });
    const booster = await tx.boosterType.upsert({
      where: { slug: "multisport" }, update: {},
      create: { slug: "multisport", nameFr: "Multisport", category: "MULTISPORT", active: false },
    });
    for (const weight of defaults) {
      await tx.boosterRarityWeight.upsert({
        where: { boosterTypeId_rarity: { boosterTypeId: booster.id, rarity: weight.rarity } },
        update: {}, create: { boosterTypeId: booster.id, ...weight },
      });
    }
  });
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
}).finally(async () => prisma.$disconnect());
