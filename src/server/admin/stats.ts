import "server-only";
import { db } from "@/lib/db/prisma";
import type { PrismaClient, Rarity } from "@/generated/prisma/client";
import { openingRarities } from "@/server/boosters/opening";

/** Global indicators of GET /api/admin/stats. Amounts are strings to keep BigInt precision. */
export async function getAdminStats(client: PrismaClient = db) {
  const [users, athletes, activeAthletes, editions, activeEditions, minted, inCirculation, byRarity, passive, openings,
    sold, activeListings, bankSales] = await Promise.all([
    client.user.count(), client.athlete.count(), client.athlete.count({ where: { active: true } }),
    client.cardEdition.count(), client.cardEdition.count({ where: { active: true } }),
    client.cardInstance.count(), client.cardInstance.count({ where: { retiredAt: null } }),
    client.$queryRaw<{ rarity: Rarity; count: bigint }[]>`
      SELECT e.rarity::text AS rarity, COUNT(*) AS count FROM "CardInstance" ci JOIN "CardEdition" e ON e.id = ci."editionId" GROUP BY e.rarity`,
    client.passiveBoosterState.aggregate({ _sum: { generatedTotal: true } }),
    client.boosterOpening.groupBy({ by: ["usedPassiveStock"], _count: { _all: true } }),
    client.marketplaceListing.aggregate({ where: { status: "SOLD" }, _count: { _all: true }, _sum: { price: true } }),
    client.marketplaceListing.count({ where: { status: "ACTIVE" } }),
    client.walletTransaction.aggregate({ where: { type: "BANK_SALE" }, _count: { _all: true }, _sum: { amount: true } }),
  ]);
  const counts = new Map(byRarity.map((row) => [row.rarity, Number(row.count)]));
  const opened = (passiveStock: boolean) => openings.find((row) => row.usedPassiveStock === passiveStock)?._count._all ?? 0;
  return {
    users, athletes: { total: athletes, active: activeAthletes }, editions: { total: editions, active: activeEditions },
    cards: { minted, inCirculation, retired: minted - inCirculation,
      byRarity: openingRarities.map((rarity) => ({ rarity, count: counts.get(rarity) ?? 0 })) },
    boosters: { passiveGenerated: String(passive._sum.generatedTotal ?? 0), opened: opened(true) + opened(false), openedFromPassive: opened(true) },
    marketplace: { sales: sold._count._all, volume: String(sold._sum.price ?? 0), activeListings },
    bank: { sales: bankSales._count._all, paid: String(bankSales._sum.amount ?? 0) },
  };
}
export type AdminStats = Awaited<ReturnType<typeof getAdminStats>>;
