import "server-only";
import { db } from "@/lib/db/prisma";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { ApiError } from "@/lib/api/errors";
import { serializePassiveSnapshot, syncPassiveBoosters } from "@/server/boosters/passive";
export const discoveryBoosterId = "discovery-booster";
export async function getGameCatalogue(client: PrismaClient = db) {
    const booster = await client.boosterType.findUnique({ where: { id: discoveryBoosterId }, include: { weights: true, sports: { include: { sport: true } } } });
    if (!booster?.active)
        throw new ApiError("GAME_NOT_READY", "Le catalogue de découverte n’est pas encore disponible.", 503);
    return { boosterTypeId: booster.id, cardCount: booster.cardCount, sports: booster.sports.filter(x => x.sport.active).map(x => ({ id: x.sportId, nameFr: x.sport.nameFr })).sort((a, b) => a.nameFr.localeCompare(b.nameFr, "fr")), weights: booster.weights.map(x => ({ rarity: x.rarity, weightBasisPoints: x.weightBasisPoints })) };
}
export async function getPlayerBoosters(actorId: string, client: PrismaClient = db) {
    return client.$transaction(async (tx) => {
        const passive = await syncPassiveBoosters(tx, actorId);
        const inventory = await tx.boosterInventory.findUnique({ where: { userId_boosterTypeId: { userId: actorId, boosterTypeId: discoveryBoosterId } } });
        return { ...serializePassiveSnapshot(passive), welcomeAvailable: inventory?.quantity ?? 0, welcomeClaimed: inventory !== null };
    });
}
export async function claimWelcomeBooster(tx: Prisma.TransactionClient, actorId: string, boosterTypeId = discoveryBoosterId) {
    await tx.$executeRaw `SELECT pg_advisory_xact_lock(hashtextextended(${`booster:user:${actorId}`},0))`;
    if (!await tx.user.findUnique({ where: { id: actorId }, select: { id: true } }))
        throw new ApiError("UNAUTHENTICATED", "Veuillez vous connecter.", 401);
    await tx.$queryRaw `SELECT id FROM "BoosterType" WHERE id=${boosterTypeId} FOR SHARE`;
    const booster = await tx.boosterType.findUnique({ where: { id: boosterTypeId } });
    const [clock] = await tx.$queryRaw<{
        now: Date;
    }[]> `SELECT clock_timestamp() AS now`;
    if (!booster?.active || !clock || (booster.startsAt && booster.startsAt > clock.now) || (booster.endsAt && booster.endsAt <= clock.now))
        throw new ApiError("GAME_NOT_READY", "Le booster de bienvenue est indisponible.", 409);
    // The retained inventory row is the one-time receipt, even after its quantity becomes zero.
    const inventory = await tx.boosterInventory.upsert({ where: { userId_boosterTypeId: { userId: actorId, boosterTypeId: booster.id } }, update: {}, create: { userId: actorId, boosterTypeId: booster.id, quantity: 1 } });
    return { quantity: inventory.quantity };
}
