import "server-only";
import { db } from "@/lib/db/prisma";
import type { PrismaClient } from "@/generated/prisma/client";
import type { CardRarity } from "@/components/cards/athlete-card";
import { ApiError } from "@/lib/api/errors";

const rarities: CardRarity[] = ["COMMON", "UNCOMMON", "RARE", "EPIC", "LEGENDARY", "MYTHIC"];

/** Read-only summary of GET /api/me. Wallet amounts are serialized as strings to keep BigInt precision. */
export async function getPlayerProfile(actorId: string, client: PrismaClient = db) {
  const owned = { ownerId: actorId, retiredAt: null };
  const [user, cards, editions, discoveredEditions, discoveredAthletes, byRarity, openings, passive] = await Promise.all([
    client.user.findUnique({ where: { id: actorId }, select: { id: true, name: true, email: true, role: true, createdAt: true,
      wallet: { select: { balance: true, lifetimeEarnings: true, lifetimeSpending: true } } } }),
    client.cardInstance.count({ where: owned }),
    client.cardInstance.groupBy({ by: ["editionId"], where: owned }),
    client.cardDiscovery.count({ where: { userId: actorId } }),
    client.athlete.count({ where: { editions: { some: { discoveries: { some: { userId: actorId } } } } } }),
    client.$queryRaw<{ rarity: CardRarity; count: bigint }[]>`
      SELECT e.rarity::text AS rarity, COUNT(*) AS count FROM "CardInstance" ci JOIN "CardEdition" e ON e.id = ci."editionId"
      WHERE ci."ownerId" = ${actorId} AND ci."retiredAt" IS NULL GROUP BY e.rarity`,
    client.boosterOpening.groupBy({ by: ["usedPassiveStock"], where: { userId: actorId }, _count: { _all: true } }),
    client.passiveBoosterState.findUnique({ where: { userId: actorId }, select: { generatedTotal: true } }),
  ]);
  if (!user) throw new ApiError("UNAUTHENTICATED", "Veuillez vous connecter.", 401);
  const counts = new Map(byRarity.map((row) => [row.rarity, Number(row.count)]));
  const opened = (passiveStock: boolean) => openings.find((row) => row.usedPassiveStock === passiveStock)?._count._all ?? 0;
  return {
    id: user.id, name: user.name, email: user.email, role: user.role, memberSince: user.createdAt.toISOString(),
    wallet: {
      balance: String(user.wallet?.balance ?? 0), lifetimeEarnings: String(user.wallet?.lifetimeEarnings ?? 0),
      lifetimeSpending: String(user.wallet?.lifetimeSpending ?? 0),
    },
    collection: { cards, editions: editions.length, discoveredEditions, discoveredAthletes,
      byRarity: rarities.map((rarity) => ({ rarity, count: counts.get(rarity) ?? 0 })) },
    boosters: { opened: opened(true) + opened(false), openedFromFreeStock: opened(true),
      freeGenerated: Number(passive?.generatedTotal ?? 0) },
  };
}
export type PlayerProfile = Awaited<ReturnType<typeof getPlayerProfile>>;

export async function getWalletBalance(actorId: string, client: PrismaClient = db) {
  return (await client.wallet.findUnique({ where: { userId: actorId }, select: { balance: true } }))?.balance ?? BigInt(0);
}
