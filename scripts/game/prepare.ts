import { config } from "dotenv";
import { parseArgs } from "node:util";
import { z } from "zod";
import { db } from "../../src/lib/db/prisma";
import { ApiError } from "../../src/lib/api/errors";
import { Rarity } from "../../src/generated/prisma/enums";
import { assertAdminActor, updateSport } from "../../src/server/sports/service";

config({ path: [".env.local", ".env"], quiet: true });
const athleteReferences = ["34162098", "34157136"];
const editionNames: Record<Rarity, string> = { COMMON: "Classique", UNCOMMON: "Découverte", RARE: "Élite", EPIC: "Prestige", LEGENDARY: "Or", MYTHIC: "Mythique" };
let connected = false;
try {
  const { values } = parseArgs({ options: { "actor-id": { type: "string" }, confirm: { type: "boolean" } }, strict: true });
  if (!values.confirm) throw new ApiError("CONFIRMATION_REQUIRED", "Ajoutez --confirm pour préparer le catalogue local.", 400);
  const actorId = z.string().min(1).max(100).parse(values["actor-id"]);
  connected = true;
  const result = await db.$transaction(async tx => {
    await assertAdminActor(tx, actorId);
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended('game:catalogue:prepare', 0))`;
    if (!await tx.gameConfiguration.findUnique({ where: { id: "default" } })) throw new ApiError("MISSING_CONFIGURATION", "Exécutez le seed avant de préparer le catalogue.", 409);
    const template = await tx.boosterType.findUnique({ where: { slug: "multisport" }, include: { weights: true } });
    if (!template || template.weights.length !== 6 || template.weights.some(weight => weight.weightBasisPoints <= 0 || !Number.isSafeInteger(weight.weightBasisPoints)) ||
      template.weights.reduce((sum, weight) => sum + weight.weightBasisPoints, 0) !== 10_000) {
      throw new ApiError("INVALID_PROBABILITIES", "Les six probabilités du modèle multisport doivent être positives et totaliser 100 %.", 409);
    }
    const identities = await tx.athleteExternalId.findMany({ where: { provider: "THESPORTSDB", externalId: { in: athleteReferences } }, include: { athlete: true } });
    if (identities.length !== 2 || new Set(identities.map(identity => identity.athleteId)).size !== 2) throw new ApiError("MISSING_ATHLETES", "Importez Mbappé et Hamilton avec leurs identifiants TheSportsDB avant cette préparation.", 409);
    const athleteIds = identities.map(identity => identity.athleteId).sort();
    await tx.$queryRaw`SELECT id FROM "Athlete" WHERE id = ANY(${athleteIds}::text[]) ORDER BY id FOR SHARE`;
    const athletes = await tx.athlete.findMany({ where: { id: { in: athleteIds } }, include: { sport: true }, orderBy: { id: "asc" } });
    if (athletes.length !== 2 || athletes.some(athlete => !athlete.active)) throw new ApiError("INACTIVE_ATHLETE", "Les deux athlètes doivent être actifs ; aucune réactivation automatique n’est effectuée.", 409);
    const sportIds = [...new Set(athletes.map(athlete => athlete.sportId))].sort();
    if (sportIds.length !== 2) throw new ApiError("INVALID_SPORTS", "La démonstration exige deux sports distincts associés aux athlètes.", 409);
    for (const sportId of sportIds) await updateSport(tx, sportId, { active: true }, actorId);
    const booster = await tx.boosterType.upsert({ where: { id: "discovery-booster" }, update: {}, create: {
      id: "discovery-booster", slug: "decouverte-multisport", category: "MULTISPORT", nameFr: "Découverte multisport", cardCount: 5, price: 0n, active: true } });
    if (booster.category !== "MULTISPORT" || booster.cardCount < 1) throw new ApiError("INVALID_BOOSTER", "Le booster existant n’est pas compatible avec ce catalogue.", 409);
    for (const weight of template.weights) await tx.boosterRarityWeight.upsert({
      where: { boosterTypeId_rarity: { boosterTypeId: booster.id, rarity: weight.rarity } }, update: {},
      create: { boosterTypeId: booster.id, rarity: weight.rarity, weightBasisPoints: weight.weightBasisPoints } });
    for (const sportId of sportIds) await tx.boosterSport.upsert({ where: { boosterTypeId_sportId: { boosterTypeId: booster.id, sportId } }, update: {}, create: { boosterTypeId: booster.id, sportId } });
    const editions = [];
    for (const athlete of athletes) {
      for (const rarity of Object.values(Rarity)) {
        const edition = await tx.cardEdition.upsert({ where: { id: `discovery-${athlete.id}-${rarity.toLowerCase()}` }, update: {}, create: {
          id: `discovery-${athlete.id}-${rarity.toLowerCase()}`, athleteId: athlete.id, name: editionNames[rarity], rarity,
          active: true, maxSupply: null, baseValue: 0n } });
        if (edition.athleteId !== athlete.id || edition.rarity !== rarity || !edition.active ||
          (edition.maxSupply !== null && edition.mintedSupply >= edition.maxSupply)) {
          throw new ApiError("INCOMPLETE_POOL", "Une édition existante est inactive, épuisée ou incompatible. Les modifications administratives sont préservées.", 409);
        }
        editions.push(edition);
        await tx.boosterEdition.upsert({ where: { boosterTypeId_editionId: { boosterTypeId: booster.id, editionId: edition.id } }, update: {}, create: { boosterTypeId: booster.id, editionId: edition.id } });
      }
    }
    const effectiveWeights = await tx.boosterRarityWeight.findMany({ where: { boosterTypeId: booster.id } });
    if (effectiveWeights.length !== 6 || effectiveWeights.some(weight => weight.weightBasisPoints <= 0) || effectiveWeights.reduce((sum, weight) => sum + weight.weightBasisPoints, 0) !== 10_000) {
      throw new ApiError("INVALID_PROBABILITIES", "Les probabilités actuelles du booster sont invalides ; aucune valeur administrateur n’est remplacée.", 409);
    }
    for (const athlete of athletes) {
      // Each selected sport must satisfy an opening, even if all slots roll one rarity.
      for (const rarity of Object.values(Rarity)) {
        const pool = editions.filter(edition => edition.athleteId === athlete.id && edition.rarity === rarity);
        if (!pool.some(edition => edition.maxSupply === null) && pool.reduce((sum, edition) => sum + ((edition.maxSupply ?? 0) - edition.mintedSupply), 0) < booster.cardCount) {
          throw new ApiError("INCOMPLETE_POOL", "Une réserve de rareté de l’un des sports ne peut pas satisfaire toutes les cartes d’une ouverture.", 409);
        }
      }
    }
    await tx.adminAuditLog.create({ data: { actorId, action: "GAME_CATALOGUE_PREPARE", entityType: "BoosterType", entityId: booster.id,
      after: { athleteIds, sportIds, editionIds: editions.map(edition => edition.id), cardCount: booster.cardCount,
        active: booster.active, weights: effectiveWeights.map(weight => ({ rarity: weight.rarity, weightBasisPoints: weight.weightBasisPoints })) } } });
    return { boosterId: booster.id, active: booster.active, athletes: athletes.length, sports: sportIds.length, preparedEditions: editions.length };
  }, { timeout: 15_000 });
  console.log(JSON.stringify(result));
} catch (error) {
  console.error(JSON.stringify({ error: error instanceof ApiError ? error.code : error instanceof z.ZodError ? "INVALID_INPUT" : "PREPARATION_FAILED",
    message: error instanceof ApiError ? error.message : "La préparation a échoué. Vérifiez les paramètres et la base locale." }));
  process.exitCode = 1;
} finally {
  if (connected) await db.$disconnect().catch(() => undefined);
}
