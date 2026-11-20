import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { Rarity } from "@/generated/prisma/enums";

/** Generic names: they claim no sporting title or result. Same names as the demonstration catalogue. */
export const defaultEditionNames: Record<Rarity, string> = {
  COMMON: "Classique", UNCOMMON: "Découverte", RARE: "Élite", EPIC: "Prestige", LEGENDARY: "Or", MYTHIC: "Mythique",
};

/**
 * Gives an athlete one unlimited edition per rarity and makes them eligible for a booster.
 * Existing editions keep every administrator setting (name, supply, value, activation); only missing rows are created.
 * The caller revalues the editions (prestige recompute does it per sport).
 */
export async function ensureDefaultEditions(tx: Prisma.TransactionClient, athleteId: string, boosterTypeId: string | null) {
  const athlete = await tx.athlete.findUniqueOrThrow({ where: { id: athleteId }, select: { id: true, sportId: true } });
  const booster = boosterTypeId ? await tx.boosterType.findUnique({ where: { id: boosterTypeId }, select: { id: true } }) : null;
  let created = 0;
  for (const rarity of Object.values(Rarity)) {
    const id = `discovery-${athlete.id}-${rarity.toLowerCase()}`;
    const existing = await tx.cardEdition.findUnique({ where: { id }, select: { id: true } });
    if (!existing) {
      await tx.cardEdition.create({ data: { id, athleteId: athlete.id, name: defaultEditionNames[rarity], rarity, active: true, maxSupply: null, baseValue: 0n } });
      created++;
    }
    if (booster) await tx.boosterEdition.upsert({ where: { boosterTypeId_editionId: { boosterTypeId: booster.id, editionId: id } },
      update: {}, create: { boosterTypeId: booster.id, editionId: id } });
  }
  if (booster) await tx.boosterSport.upsert({ where: { boosterTypeId_sportId: { boosterTypeId: booster.id, sportId: athlete.sportId } },
    update: {}, create: { boosterTypeId: booster.id, sportId: athlete.sportId } });
  return { created, linkedToBooster: Boolean(booster) };
}
