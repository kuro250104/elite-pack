import "server-only";
import { z } from "zod";
import { db } from "@/lib/db/prisma";
import type { Prisma, PrismaClient, Rarity } from "@/generated/prisma/client";
import { ApiError } from "@/lib/api/errors";
import { assertAdminActor } from "@/server/sports/service";
import { openingRarities, validateOpeningWeights } from "@/server/boosters/opening";
import { revalueEditions } from "@/server/economy/valuation";

const coins = z.number().int("Indiquez un nombre entier de pièces.").min(0, "La valeur ne peut pas être négative.").max(1_000_000_000, "La valeur est trop élevée.");
const rarityValues = z.object(Object.fromEntries(openingRarities.map((rarity) => [rarity, coins])) as Record<Rarity, typeof coins>).strict();
export const economySettingsSchema = z.object({
  startingBalance: coins,
  bankResaleBasisPoints: z.number().int().min(0, "Le taux doit être compris entre 0 et 100 %.").max(10_000, "Le taux doit être compris entre 0 et 100 %."),
  passiveIntervalSeconds: z.number().int().min(60, "L’intervalle doit être d’au moins une minute.").max(86_400, "L’intervalle doit être d’au plus 24 heures."),
  passiveMaxStock: z.number().int().min(1, "Le stock maximal doit être compris entre 1 et 10.").max(10, "Le stock maximal doit être compris entre 1 et 10."),
  rarityValues,
}).strict();
export type EconomySettings = z.infer<typeof economySettingsSchema>;

const basisPoints = z.number().int().min(0).max(10_000);
export const boosterSettingsSchema = z.object({
  cardCount: z.number().int().min(1, "Un booster contient au moins une carte.").max(50, "Un booster contient au plus 50 cartes."),
  weights: z.object(Object.fromEntries(openingRarities.map((rarity) => [rarity, basisPoints])) as Record<Rarity, typeof basisPoints>).strict(),
}).strict().refine((input) => Object.values(input.weights).reduce((sum, value) => sum + value, 0) === 10_000,
  { message: "Les six probabilités doivent totaliser exactement 100 %.", path: ["weights"] });
export type BoosterSettings = z.infer<typeof boosterSettingsSchema>;

/** Integer settings as plain numbers for forms; BigInt amounts stay within the validated bounds. */
export async function getEconomySettings(client: PrismaClient | Prisma.TransactionClient = db): Promise<EconomySettings> {
  const [config, values] = await Promise.all([
    client.gameConfiguration.findUniqueOrThrow({ where: { id: "default" } }), client.rarityValue.findMany(),
  ]);
  const byRarity = new Map(values.map((value) => [value.rarity, Number(value.baseValue)]));
  return { startingBalance: Number(config.startingBalance), bankResaleBasisPoints: config.bankResaleBasisPoints,
    passiveIntervalSeconds: config.passiveIntervalSeconds, passiveMaxStock: config.passiveMaxStock,
    rarityValues: Object.fromEntries(openingRarities.map((rarity) => [rarity, byRarity.get(rarity) ?? 0])) as Record<Rarity, number> };
}

/** Updates the economy in one transaction; changed rarity values revalue every edition. Recorded in the audit log. */
export async function updateEconomySettings(tx: Prisma.TransactionClient, actorId: string, input: unknown) {
  await assertAdminActor(tx, actorId);
  const next = economySettingsSchema.parse(input);
  await tx.$queryRaw`SELECT id FROM "GameConfiguration" WHERE id = 'default' FOR UPDATE`;
  const before = await getEconomySettings(tx);
  await tx.gameConfiguration.update({ where: { id: "default" }, data: { startingBalance: BigInt(next.startingBalance),
    bankResaleBasisPoints: next.bankResaleBasisPoints, passiveIntervalSeconds: next.passiveIntervalSeconds, passiveMaxStock: next.passiveMaxStock } });
  const changedRarities = openingRarities.filter((rarity) => before.rarityValues[rarity] !== next.rarityValues[rarity]);
  for (const rarity of changedRarities) await tx.rarityValue.upsert({ where: { rarity },
    create: { rarity, baseValue: BigInt(next.rarityValues[rarity]) }, update: { baseValue: BigInt(next.rarityValues[rarity]) } });
  const revalued = changedRarities.length ? await revalueEditions(tx, "all") : 0;
  await tx.adminAuditLog.create({ data: { actorId, action: "ECONOMY_UPDATE", entityType: "GameConfiguration", entityId: "default",
    before: before as unknown as Prisma.InputJsonObject, after: next as unknown as Prisma.InputJsonObject } });
  return { settings: next, revalued };
}

export async function listBoosterSettings(client: PrismaClient = db) {
  const boosters = await client.boosterType.findMany({ orderBy: { nameFr: "asc" }, include: { weights: true } });
  return boosters.map((booster) => ({ id: booster.id, nameFr: booster.nameFr, category: booster.category, active: booster.active,
    cardCount: booster.cardCount,
    weights: Object.fromEntries(openingRarities.map((rarity) => [rarity, booster.weights.find((weight) => weight.rarity === rarity)?.weightBasisPoints ?? 0])) as Record<Rarity, number> }));
}

/** Probabilities are never adjusted silently: they must total exactly 100 % or the update is refused. */
export async function updateBoosterSettings(tx: Prisma.TransactionClient, actorId: string, boosterTypeId: string, input: unknown) {
  await assertAdminActor(tx, actorId);
  const next = boosterSettingsSchema.parse(input);
  const weights = openingRarities.map((rarity) => ({ rarity, weightBasisPoints: next.weights[rarity] }));
  validateOpeningWeights(weights, next.cardCount);
  await tx.$queryRaw`SELECT id FROM "BoosterType" WHERE id = ${boosterTypeId} FOR UPDATE`;
  const before = await tx.boosterType.findUnique({ where: { id: boosterTypeId }, include: { weights: true } });
  if (!before) throw new ApiError("NOT_FOUND", "Ce booster est introuvable.", 404);
  await tx.boosterType.update({ where: { id: boosterTypeId }, data: { cardCount: next.cardCount } });
  for (const weight of weights) await tx.boosterRarityWeight.upsert({ where: { boosterTypeId_rarity: { boosterTypeId, rarity: weight.rarity } },
    create: { boosterTypeId, ...weight }, update: { weightBasisPoints: weight.weightBasisPoints } });
  await tx.adminAuditLog.create({ data: { actorId, action: "BOOSTER_SETTINGS_UPDATE", entityType: "BoosterType", entityId: boosterTypeId,
    before: { cardCount: before.cardCount, weights: Object.fromEntries(before.weights.map((weight) => [weight.rarity, weight.weightBasisPoints])) },
    after: next as unknown as Prisma.InputJsonObject } });
  return next;
}

const actionLabels: Record<string, string> = {
  ECONOMY_UPDATE: "Règles économiques modifiées", BOOSTER_SETTINGS_UPDATE: "Booster modifié", PRESTIGE_RECOMPUTE: "Prestige recalculé",
  ATHLETE_UPDATE: "Athlète modifié", UPDATE_SPORT: "Sport modifié", EDITION_CREATE: "Édition créée", EDITION_UPDATE: "Édition modifiée",
};
/** Recent configuration changes for the admin history. */
export async function recentAdminChanges(client: PrismaClient = db, actions = Object.keys(actionLabels), take = 20) {
  const rows = await client.adminAuditLog.findMany({ where: { action: { in: actions } }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take,
    select: { id: true, action: true, entityId: true, createdAt: true, before: true, after: true, actor: { select: { name: true, email: true } } } });
  return rows.map((row) => ({ id: row.id, action: row.action, label: actionLabels[row.action] ?? row.action, entityId: row.entityId,
    createdAt: row.createdAt.toISOString(), actor: row.actor.name ?? row.actor.email ?? "Administrateur", before: row.before, after: row.after }));
}
