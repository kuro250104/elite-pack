import "server-only";
import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { ApiError } from "@/lib/api/errors";
import { assertAdminActor } from "@/server/sports/service";
import { discoveryBoosterId } from "@/server/game/catalog";

export const boosterGrantSchema = z.object({
  quantity: z.number().int("Indiquez un nombre entier de boosters.").min(1, "Offrez au moins un booster.").max(100, "Offrez au plus 100 boosters à la fois."),
}).strict();

/**
 * Adds boosters to the gift inventory of every registered player (the passive stock stays capped separately).
 * A player who never claimed the welcome booster also receives it, since the inventory row doubles as its receipt.
 * The grant key makes the operation idempotent: replaying it returns the first result without granting again.
 */
export async function grantBoostersToAll(tx: Prisma.TransactionClient, actorId: string, input: unknown, grantKey: string) {
  await assertAdminActor(tx, actorId);
  const { quantity } = boosterGrantSchema.parse(input);
  const key = z.uuid().parse(grantKey);
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`booster-grant:${key}`}, 0))`;
  const previous = await tx.adminAuditLog.findFirst({ where: { action: "BOOSTER_GRANT", entityId: key } });
  if (previous) {
    const stored = z.object({ quantity: z.number(), players: z.number() }).parse(previous.after);
    if (stored.quantity !== quantity) throw new ApiError("IDEMPOTENCY_CONFLICT", "Cette clé a déjà été utilisée pour un autre don.", 409);
    return { ...stored, replay: true };
  }
  const booster = await tx.boosterType.findUnique({ where: { id: discoveryBoosterId }, select: { id: true } });
  if (!booster) throw new ApiError("GAME_NOT_READY", "Le booster de découverte n’existe pas encore : préparez le catalogue d’abord.", 409);
  const players = await tx.$executeRaw`
    INSERT INTO "BoosterInventory" ("userId", "boosterTypeId", "quantity")
    SELECT u.id, ${booster.id}, ${quantity + 1} FROM "User" u
    ON CONFLICT ("userId", "boosterTypeId") DO UPDATE SET "quantity" = "BoosterInventory"."quantity" + ${quantity}`;
  const result = { quantity, players };
  await tx.adminAuditLog.create({ data: { actorId, action: "BOOSTER_GRANT", entityType: "BoosterInventory", entityId: key,
    after: { ...result, boosterTypeId: booster.id } } });
  return { ...result, replay: false };
}
