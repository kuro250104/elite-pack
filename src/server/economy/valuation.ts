import "server-only";
import { Prisma } from "@/generated/prisma/client";

/** Integer coins only: rarity value × (100 + effective prestige) / 100, rounded down. Prestige doubles the value at most. */
export function editionBaseValue(rarityValue: bigint, prestige: number) {
  const bounded = Math.min(100, Math.max(0, Math.trunc(prestige)));
  return (rarityValue * BigInt(100 + bounded)) / BigInt(100);
}

/** Bank buyback price: base value × configured basis points / 10 000, rounded down. */
export function bankResalePrice(baseValue: bigint, basisPoints: number) {
  if (!Number.isInteger(basisPoints) || basisPoints < 0 || basisPoints > 10_000) throw new Error("Taux de revente invalide.");
  return (baseValue * BigInt(basisPoints)) / BigInt(10_000);
}

/**
 * Recomputes CardEdition.baseValue for one sport or one athlete, inside the caller's transaction.
 * Same formula as editionBaseValue, evaluated in SQL to avoid one query per edition.
 */
export async function revalueEditions(tx: Prisma.TransactionClient, scope: { sportId: string } | { athleteId: string }) {
  const filter = "sportId" in scope ? Prisma.sql`a."sportId" = ${scope.sportId}` : Prisma.sql`a.id = ${scope.athleteId}`;
  return tx.$executeRaw`
    UPDATE "CardEdition" e SET "baseValue" = v.value, "updatedAt" = clock_timestamp()
    FROM (
      SELECT e2.id, rv."baseValue" * (100 + LEAST(100, GREATEST(0, COALESCE(a."prestigeOverride", a."prestigeScore")))) / 100 AS value
      FROM "CardEdition" e2 JOIN "Athlete" a ON a.id = e2."athleteId" JOIN "RarityValue" rv ON rv.rarity = e2.rarity
      WHERE ${filter}
    ) v
    WHERE e.id = v.id AND e."baseValue" <> v.value`;
}
