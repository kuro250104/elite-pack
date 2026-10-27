import "server-only";
import { randomInt } from "node:crypto";
import { z } from "zod";
import { Prisma, type PrismaClient, type Rarity } from "@/generated/prisma/client";
import { ApiError } from "@/lib/api/errors";
import { db } from "@/lib/db/prisma";
import { mintCardInstance } from "@/server/cards/service";
import { consumePassiveBooster } from "./passive";

export const openBoosterSchema = z.object({
  boosterTypeId: z.string().min(1).max(200), sportId: z.string().min(1).max(200).optional(),
  source: z.enum(["passive", "welcome"]), idempotencyKey: z.uuid(),
}).strict();
export const openingRarities: readonly Rarity[] = ["COMMON", "UNCOMMON", "RARE", "EPIC", "LEGENDARY", "MYTHIC"];
export interface RarityWeight { rarity: Rarity; weightBasisPoints: number }
export function validateOpeningWeights(weights: readonly RarityWeight[], cardCount: number): void {
  if (!Number.isInteger(cardCount) || cardCount < 1 || cardCount > 50 || weights.length !== 6 ||
    new Set(weights.map((weight) => weight.rarity)).size !== 6 ||
    weights.some((weight) => !openingRarities.includes(weight.rarity) || !Number.isInteger(weight.weightBasisPoints) || weight.weightBasisPoints < 0 || weight.weightBasisPoints > 10000) ||
    weights.reduce((sum, weight) => sum + weight.weightBasisPoints, 0) !== 10000) {
    throw new ApiError("BOOSTER_CONFIGURATION_INVALID", "La configuration de ce booster est invalide.", 409);
  }
}
export function selectOpeningRarity(weights: readonly RarityWeight[], roll: number = randomInt(10000)): Rarity {
  if (!Number.isInteger(roll) || roll < 0 || roll >= 10000) throw new Error("Tirage de rareté invalide.");
  let cumulative = 0;
  for (const weight of weights) {
    cumulative += weight.weightBasisPoints;
    if (roll < cumulative) return weight.rarity;
  }
  throw new ApiError("BOOSTER_CONFIGURATION_INVALID", "La configuration de ce booster est invalide.", 409);
}

export interface OpenedCard {
  instanceId: string; editionId: string; athleteId: string; name: string; sport: string; rarity: Rarity;
  editionName: string; nationality: string | null; prestigeScore: number; serialNumber: number | null;
  maxSupply: number | null; acquiredAt: string;
}
export interface BoosterOpeningResult {
  openingId: string; replay: boolean; cards: OpenedCard[]; source: "passive" | "welcome";
}
const cardSelection = {
  id: true, editionId: true, serialNumber: true, acquiredAt: true,
  edition: { select: { name: true, rarity: true, maxSupply: true, athlete: { select: {
    id: true, name: true, nationality: true, prestigeScore: true, prestigeOverride: true, sport: { select: { nameFr: true } },
  } } } },
} satisfies Prisma.CardInstanceSelect;
async function openingResult(tx: Prisma.TransactionClient, id: string, source: "passive" | "welcome", replay: boolean): Promise<BoosterOpeningResult> {
  const cards = await tx.cardInstance.findMany({ where: { openingId: id }, select: cardSelection, orderBy: [{ mintedAt: "asc" }, { id: "asc" }] });
  return { openingId: id, replay, source, cards: cards.map((card) => ({
    instanceId: card.id, editionId: card.editionId, athleteId: card.edition.athlete.id, name: card.edition.athlete.name,
    sport: card.edition.athlete.sport.nameFr, rarity: card.edition.rarity, editionName: card.edition.name,
    nationality: card.edition.athlete.nationality, prestigeScore: card.edition.athlete.prestigeOverride ?? card.edition.athlete.prestigeScore,
    serialNumber: card.serialNumber, maxSupply: card.edition.maxSupply, acquiredAt: card.acquiredAt.toISOString(),
  })) };
}

export async function openBooster(actorId: string, input: unknown, client: PrismaClient = db): Promise<BoosterOpeningResult> {
  const parsed = openBoosterSchema.safeParse(input);
  if (!parsed.success) throw new ApiError("INVALID_OPENING", "Vérifiez le booster et le sport sélectionnés.", 400);
  const command = parsed.data;
  return client.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`booster:user:${actorId}`}, 0))`;
    if (!await tx.user.findUnique({ where: { id: actorId }, select: { id: true } })) {
      throw new ApiError("PLAYER_NOT_FOUND", "Ce joueur est introuvable.", 404);
    }
    const replay = await tx.boosterOpening.findUnique({ where: { userId_idempotencyKey: { userId: actorId, idempotencyKey: command.idempotencyKey } } });
    if (replay) {
      const snapshot = replay.configurationSnapshot as Prisma.JsonObject;
      if (replay.boosterTypeId !== command.boosterTypeId || replay.selectedSportId !== (command.sportId ?? null) || snapshot.source !== command.source) {
        throw new ApiError("OPENING_KEY_CONFLICT", "Cette clé correspond déjà à une autre ouverture.", 409);
      }
      return openingResult(tx, replay.id, command.source, true);
    }
    await tx.$queryRaw`SELECT "id" FROM "BoosterType" WHERE "id" = ${command.boosterTypeId} FOR UPDATE`;
    // Lock the existing configuration children before reading them.
    await tx.$queryRaw`SELECT "boosterTypeId" FROM "BoosterRarityWeight" WHERE "boosterTypeId" = ${command.boosterTypeId} FOR SHARE`;
    await tx.$queryRaw`SELECT "sportId" FROM "BoosterSport" WHERE "boosterTypeId" = ${command.boosterTypeId} FOR SHARE`;
    await tx.$queryRaw`SELECT "editionId" FROM "BoosterEdition" WHERE "boosterTypeId" = ${command.boosterTypeId} FOR SHARE`;
    const booster = await tx.boosterType.findUnique({ where: { id: command.boosterTypeId }, include: {
      weights: true, sports: true, editions: true,
    } });
    const [clock] = await tx.$queryRaw<Array<{ now: Date }>>`SELECT clock_timestamp() AS now`;
    if (!clock) throw new Error("Horloge PostgreSQL indisponible.");
    const now = clock.now;
    if (!booster?.active || (booster.startsAt && booster.startsAt > now) || (booster.endsAt && booster.endsAt <= now)) {
      throw new ApiError("BOOSTER_UNAVAILABLE", "Ce booster n’est pas disponible.", 409);
    }
    // Free passive stock is generic: it never pays for a priced or event booster.
    if (command.source === "passive" && (booster.price !== 0n || booster.category === "EVENT")) {
      throw new ApiError("PASSIVE_BOOSTER_NOT_ALLOWED", "Les boosters gratuits ne permettent pas d’ouvrir ce booster.", 409);
    }
    validateOpeningWeights(booster.weights, booster.cardCount);
    const allowedSports = booster.sports.map((sport) => sport.sportId);
    if ((booster.category === "SPORT" && !command.sportId) ||
      (command.sportId && allowedSports.length && !allowedSports.includes(command.sportId))) {
      throw new ApiError("SPORT_UNAVAILABLE", "Ce sport n’est pas disponible pour ce booster.", 409);
    }
    const sportIds = command.sportId ? [command.sportId] : allowedSports;
    if (command.sportId) {
      await tx.$queryRaw`SELECT "id" FROM "Sport" WHERE "id" = ${command.sportId} FOR SHARE`;
      if (!await tx.sport.findFirst({ where: { id: command.sportId, active: true }, select: { id: true } })) {
        throw new ApiError("SPORT_UNAVAILABLE", "Ce sport n’est pas disponible pour ce booster.", 409);
      }
    }
    const filter: Prisma.CardEditionWhereInput = {
      active: true, releaseDate: { lte: now },
      athlete: { active: true, sport: { active: true, ...(sportIds.length ? { id: { in: sportIds } } : {}) } },
      ...(booster.season ? { season: booster.season } : {}),
      ...(booster.competition ? { competition: booster.competition } : {}),
      ...(booster.editions.length ? { id: { in: booster.editions.map((edition) => edition.editionId) } } : {}),
    };
    const initial = await tx.cardEdition.findMany({ where: filter, select: { id: true, athleteId: true, athlete: { select: { sportId: true } } }, orderBy: { id: "asc" } });
    const lockSports = [...new Set(initial.map((edition) => edition.athlete.sportId))].sort();
    const lockAthletes = [...new Set(initial.map((edition) => edition.athleteId))].sort();
    if (lockSports.length) await tx.$queryRaw`SELECT "id" FROM "Sport" WHERE "id" IN (${Prisma.join(lockSports)}) ORDER BY "id" FOR SHARE`;
    if (lockAthletes.length) await tx.$queryRaw`SELECT "id" FROM "Athlete" WHERE "id" IN (${Prisma.join(lockAthletes)}) ORDER BY "id" FOR SHARE`;
    if (initial.length) await tx.$queryRaw`SELECT "id" FROM "CardEdition" WHERE "id" IN (${Prisma.join(initial.map((edition) => edition.id))}) ORDER BY "id" FOR UPDATE`;
    // Re-read after locks, restricting to the rows actually locked.
    const lockedPool = initial.length ? await tx.cardEdition.findMany({ where: { AND: [filter, { id: { in: initial.map((edition) => edition.id) } }] },
      select: { id: true, rarity: true, maxSupply: true, mintedSupply: true, athleteId: true, athlete: { select: { sportId: true } } }, orderBy: { id: "asc" } }) : [];
    const initialIdentities = new Map(initial.map((edition) => [edition.id, edition]));
    // Exclude rows moved to a different athlete/sport before lock acquisition.
    const pool = lockedPool.filter((edition) => {
      const identity = initialIdentities.get(edition.id)!;
      return identity.athleteId === edition.athleteId && identity.athlete.sportId === edition.athlete.sportId;
    });
    for (const weight of booster.weights.filter((weight) => weight.weightBasisPoints > 0)) {
      const editions = pool.filter((edition) => edition.rarity === weight.rarity);
      const capacity = editions.reduce((sum, edition) => sum + (edition.maxSupply === null ? Infinity : edition.maxSupply - edition.mintedSupply), 0);
      if (capacity < booster.cardCount) throw new ApiError("BOOSTER_POOL_UNAVAILABLE", "Une rareté annoncée ne dispose pas d’assez de cartes. Le booster n’a pas été consommé.", 409);
    }
    const opening = await tx.boosterOpening.create({ data: { userId: actorId, boosterTypeId: booster.id,
      selectedSportId: command.sportId, usedPassiveStock: command.source === "passive", idempotencyKey: command.idempotencyKey,
      configurationSnapshot: { source: command.source, sportId: command.sportId ?? null, boosterTypeId: booster.id,
        cardCount: booster.cardCount, weights: booster.weights.map(({ rarity, weightBasisPoints }) => ({ rarity, weightBasisPoints })),
        season: booster.season, competition: booster.competition, eligibleSportIds: allowedSports,
        eligibleEditionIds: booster.editions.map((edition) => edition.editionId) },
    } });
    if (command.source === "passive") await consumePassiveBooster(tx, actorId);
    else {
      const consumed = await tx.boosterInventory.updateMany({ where: { userId: actorId, boosterTypeId: booster.id, quantity: { gt: 0 } }, data: { quantity: { decrement: 1 } } });
      if (consumed.count !== 1) throw new ApiError("BOOSTER_STOCK_EMPTY", "Aucun booster de bienvenue n’est disponible.", 409);
    }
    for (let index = 0; index < booster.cardCount; index++) {
      const rarity = selectOpeningRarity(booster.weights);
      const candidates = pool.filter((edition) => edition.rarity === rarity && (edition.maxSupply === null || edition.mintedSupply < edition.maxSupply));
      if (!candidates.length) throw new ApiError("BOOSTER_POOL_UNAVAILABLE", "Cette rareté est épuisée. Le booster n’a pas été consommé.", 409);
      const chosen = candidates[randomInt(candidates.length)]!;
      await mintCardInstance(tx, chosen.id, actorId, opening.id, "BOOSTER");
      chosen.mintedSupply++;
    }
    return openingResult(tx, opening.id, command.source, false);
  }, { maxWait: 5000, timeout: 15000 });
}
