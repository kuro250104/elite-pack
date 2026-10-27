import { describe, expect, it } from "vitest";
import { openBoosterSchema, selectOpeningRarity, validateOpeningWeights, type RarityWeight } from "@/server/boosters/opening";
const weights: RarityWeight[] = [
  { rarity: "COMMON", weightBasisPoints: 5500 }, { rarity: "UNCOMMON", weightBasisPoints: 2500 },
  { rarity: "RARE", weightBasisPoints: 1200 }, { rarity: "EPIC", weightBasisPoints: 500 },
  { rarity: "LEGENDARY", weightBasisPoints: 250 }, { rarity: "MYTHIC", weightBasisPoints: 50 },
];
describe("Règles du tirage sécurisé", () => {
  it("valide six poids exactement à 10 000 et une taille bornée", () => {
    expect(() => validateOpeningWeights(weights, 5)).not.toThrow();
    for (const count of [0, 51, 1.5]) expect(() => validateOpeningWeights(weights, count)).toThrow();
    expect(() => validateOpeningWeights(weights.slice(0, 5), 5)).toThrow();
    expect(() => validateOpeningWeights([...weights.slice(0, 5), weights[0]!], 5)).toThrow();
    expect(() => validateOpeningWeights(weights.map((weight, index) => index === 0 ? { ...weight, weightBasisPoints: -1 } : weight), 5)).toThrow();
    expect(() => validateOpeningWeights(weights.map((weight, index) => index === 0 ? { ...weight, weightBasisPoints: 5501 } : weight), 5)).toThrow();
  });
  it.each([[0,"COMMON"],[5499,"COMMON"],[5500,"UNCOMMON"],[7999,"UNCOMMON"],[8000,"RARE"],[9200,"EPIC"],[9700,"LEGENDARY"],[9950,"MYTHIC"],[9999,"MYTHIC"]])("respecte la frontière du tirage %s", (roll, rarity) => {
    expect(selectOpeningRarity(weights, roll as number)).toBe(rarity);
  });
  it("utilise le tirage cryptographique par défaut et refuse les valeurs hors intervalle", () => {
    expect(weights.map((weight) => weight.rarity)).toContain(selectOpeningRarity(weights));
    for (const roll of [-1,10000,0.5]) expect(() => selectOpeningRarity(weights, roll)).toThrow();
  });
  it("valide les commandes sans état client autoritaire", () => {
    expect(openBoosterSchema.safeParse({ boosterTypeId: "booster", source: "passive", idempotencyKey: "00000000-0000-4000-8000-000000000001" }).success).toBe(true);
    expect(openBoosterSchema.safeParse({ boosterTypeId: "booster", source: "passive", idempotencyKey: "invalid", stock: 10 }).success).toBe(false);
  });
});
