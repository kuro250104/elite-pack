import "server-only";
import { z } from "zod";
import { db } from "@/lib/db/prisma";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import type { CardView } from "@/components/cards/athlete-card";
import { ApiError } from "@/lib/api/errors";
const rarity = z.enum(["COMMON", "UNCOMMON", "RARE", "EPIC", "LEGENDARY", "MYTHIC"]);
export const collectionQuerySchema = z.object({ page: z.coerce.number().int().min(1).max(10000).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(24), sportId: z.string().min(1).max(100).optional(), rarity: rarity.optional(), query: z.string().trim().max(100).optional(), sort: z.enum(["recent", "name", "rarity"]).default("recent") }).strict();
export async function listCollection(actorId: string, input: unknown, client: PrismaClient = db) {
    const params = collectionQuerySchema.parse(input);
    if (!await client.user.findUnique({ where: { id: actorId }, select: { id: true } }))
        throw new ApiError("UNAUTHENTICATED", "Veuillez vous connecter.", 401);
    const where: Prisma.CardInstanceWhereInput = { ownerId: actorId, retiredAt: null, edition: { ...(params.rarity ? { rarity: params.rarity } : {}), athlete: { ...(params.sportId ? { sportId: params.sportId } : {}), ...(params.query ? { name: { contains: params.query, mode: "insensitive" } } : {}) } } };
    const orderBy: Prisma.CardInstanceOrderByWithRelationInput[] = params.sort === "name" ? [{ edition: { athlete: { name: "asc" } } }, { id: "asc" }] : params.sort === "rarity" ? [{ edition: { rarity: "desc" } }, { id: "asc" }] : [{ acquiredAt: "desc" }, { id: "desc" }];
    const [instances, total] = await Promise.all([client.cardInstance.findMany({ where, orderBy, take: params.pageSize, skip: (params.page - 1) * params.pageSize, include: { edition: { include: { athlete: { include: { sport: true } } } } } }), client.cardInstance.count({ where })]);
    const duplicates = await client.cardInstance.groupBy({ by: ["editionId"], where: { ownerId: actorId, retiredAt: null, editionId: { in: instances.map(x => x.editionId) } }, _count: { _all: true } });
    const counts = new Map(duplicates.map(x => [x.editionId, x._count._all]));
    const cards: CardView[] = instances.map(card => ({ instanceId: card.id, editionId: card.editionId, athleteId: card.edition.athleteId, name: card.edition.athlete.name, sport: card.edition.athlete.sport.nameFr, rarity: card.edition.rarity, editionName: card.edition.name, nationality: card.edition.athlete.nationality, prestigeScore: card.edition.athlete.prestigeOverride ?? card.edition.athlete.prestigeScore, serialNumber: card.serialNumber, maxSupply: card.edition.maxSupply, acquiredAt: card.acquiredAt.toISOString() }));
    return { cards, total, page: params.page, pageSize: params.pageSize, duplicates: Object.fromEntries(counts) };
}
