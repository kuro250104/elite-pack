import "server-only";
import { z } from "zod";
import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import type { CardRarity } from "@/components/cards/athlete-card";
import { ApiError } from "@/lib/api/errors";
import { db } from "@/lib/db/prisma";

const editionIdSchema = z.string().trim().min(1).max(100);
export const wishlistQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(10000).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(24),
}).strict();
export const wishlistAddSchema = z.object({ editionId: editionIdSchema }).strict();
export const maxWishlistItems = 100;

type WishlistEdition = {
  editionId: string;
  athleteId: string;
  name: string;
  sport: string;
  rarity: CardRarity;
  editionName: string;
  maxSupply: number | null;
};

export type WishlistCardView = WishlistEdition & {
  owned: boolean;
  activeListings: number;
  addedAt: string;
};

export async function listWishlist(actorId: string, input: unknown, client: PrismaClient = db) {
  const { page, pageSize } = wishlistQuerySchema.parse(input);
  const [rows, total] = await Promise.all([
    client.$queryRaw<(WishlistEdition & { addedAt: Date })[]>`
      SELECT w."editionId", a.id AS "athleteId", a.name, s."nameFr" AS sport,
        e.rarity::text AS rarity, e.name AS "editionName", e."maxSupply", w."createdAt" AS "addedAt"
      FROM "WishlistItem" w
      JOIN "CardEdition" e ON e.id = w."editionId"
      JOIN "Athlete" a ON a.id = e."athleteId"
      JOIN "Sport" s ON s.id = a."sportId"
      WHERE w."userId" = ${actorId}
      ORDER BY w."createdAt" DESC, w.id DESC
      LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`,
    client.wishlistItem.count({ where: { userId: actorId } }),
  ]);

  const counts = rows.length === 0 ? [] : await client.$queryRaw<{
    editionId: string; owned: boolean; activeListings: bigint;
  }[]>`
    SELECT ci."editionId", COALESCE(BOOL_OR(ci."ownerId" = ${actorId}), false) AS owned,
      COUNT(l.id) AS "activeListings"
    FROM "CardInstance" ci
    LEFT JOIN "MarketplaceListing" l ON l."cardInstanceId" = ci.id
      AND l.status = 'ACTIVE' AND l."sellerId" <> ${actorId}
    WHERE ci."editionId" IN (${Prisma.join(rows.map((row) => row.editionId))})
      AND ci."retiredAt" IS NULL AND (ci."ownerId" = ${actorId} OR l.id IS NOT NULL)
    GROUP BY ci."editionId"`;
  const byEdition = new Map(counts.map((count) => [count.editionId, count]));
  const items: WishlistCardView[] = rows.map((row) => {
    const count = byEdition.get(row.editionId);
    return {
      ...row,
      addedAt: row.addedAt.toISOString(),
      owned: count?.owned ?? false,
      activeListings: Number(count?.activeListings ?? 0),
    };
  });
  return { items, total, page, pageSize };
}

export async function addToWishlist(actorId: string, input: unknown, client: PrismaClient = db) {
  const { editionId } = wishlistAddSchema.parse(input);
  return client.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`wishlist:${actorId}`}, 0))`;
    const edition = await tx.cardEdition.findUnique({
      where: { id: editionId },
      select: { active: true },
    });
    if (!edition?.active) throw new ApiError("EDITION_NOT_FOUND", "Cette édition est introuvable.", 404);

    const select = { editionId: true, createdAt: true } as const;
    const existing = await tx.wishlistItem.findUnique({
      where: { userId_editionId: { userId: actorId, editionId } },
      select,
    });
    if (existing) return { item: { editionId, addedAt: existing.createdAt.toISOString() }, created: false };

    const count = await tx.wishlistItem.count({ where: { userId: actorId } });
    if (count >= maxWishlistItems) {
      throw new ApiError("WISHLIST_FULL", "Votre liste de souhaits est pleine (100 éditions au maximum).", 422);
    }
    const item = await tx.wishlistItem.create({ data: { userId: actorId, editionId }, select });
    return { item: { editionId, addedAt: item.createdAt.toISOString() }, created: true };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
}

export async function removeFromWishlist(actorId: string, editionId: string, client: PrismaClient = db) {
  const { count } = await client.wishlistItem.deleteMany({
    where: { userId: actorId, editionId: editionIdSchema.parse(editionId) },
  });
  if (count === 0) {
    throw new ApiError("WISHLIST_ITEM_NOT_FOUND", "Cette édition n’est pas dans votre liste de souhaits.", 404);
  }
  return { removed: true };
}

export async function wishlistedEditionIds(actorId: string, editionIds: string[], client: PrismaClient = db) {
  if (editionIds.length === 0) return new Set<string>();
  const items = await client.wishlistItem.findMany({
    where: { userId: actorId, editionId: { in: editionIds } },
    select: { editionId: true },
  });
  return new Set(items.map((item) => item.editionId));
}
