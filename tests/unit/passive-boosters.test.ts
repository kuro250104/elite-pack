import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/db/prisma", () => ({ db: {} }));
import { computePassiveGeneration, serializePassiveSnapshot, validatePassiveConfiguration } from "@/server/boosters/passive";
const now = new Date("2026-10-12T12:00:00Z");
const configuration = { intervalSeconds: 900, maxStock: 10 };
const start = { stock: 0, nextGenerationAt: new Date("2026-10-12T12:15:00Z") };
describe("génération passive des boosters", () => {
  it("ne produit rien avant quinze minutes", () => {
    expect(computePassiveGeneration(start, configuration, new Date("2026-10-12T12:14:59Z"))).toMatchObject({ stock: 0, generated: 0, nextGenerationAt: start.nextGenerationAt });
  });
  it("produit exactement un booster à quinze minutes", () => {
    expect(computePassiveGeneration(start, configuration, new Date("2026-10-12T12:15:00Z"))).toEqual({ stock: 1, generated: 1, nextGenerationAt: new Date("2026-10-12T12:30:00Z") });
  });
  it("produit quatre boosters après une heure hors connexion", () => {
    expect(computePassiveGeneration(start, configuration, new Date("2026-10-12T13:00:00Z"))).toMatchObject({ stock: 4, generated: 4, nextGenerationAt: new Date("2026-10-12T13:15:00Z") });
  });
  it("plafonne le stock et le compteur après vingt-quatre heures", () => {
    expect(computePassiveGeneration(start, configuration, new Date("2026-10-13T12:00:00Z"))).toEqual({ stock: 10, generated: 10, nextGenerationAt: null });
  });
  it("ne produit rien quand le stock est plein", () => {
    expect(computePassiveGeneration({ stock: 10, nextGenerationAt: new Date(0) }, configuration, now)).toEqual({ stock: 10, generated: 0, nextGenerationAt: null });
  });
  it("préserve le reste de l’intervalle sous le plafond", () => {
    const nextGenerationAt = new Date("2026-10-12T12:08:00Z");
    expect(computePassiveGeneration({ stock: 3, nextGenerationAt }, configuration, now)).toMatchObject({ stock: 3, nextGenerationAt });
  });
  it("honore une configuration modifiée sans valeurs fixes de tirage", () => {
    expect(computePassiveGeneration({ stock: 0, nextGenerationAt: now }, { intervalSeconds: 60, maxStock: 3 }, new Date(now.getTime() + 60_000))).toMatchObject({ stock: 2, generated: 2 });
  });
  it("réinitialise un cycle absent sous le plafond", () => {
    expect(computePassiveGeneration({ stock: 0, nextGenerationAt: null }, configuration, now).nextGenerationAt).toEqual(start.nextGenerationAt);
  });
  it.each([{ intervalSeconds: 0, maxStock: 10 }, { intervalSeconds: 900, maxStock: 11 }, { intervalSeconds: 1.5, maxStock: 10 }, { intervalSeconds: Number.MAX_SAFE_INTEGER, maxStock: 10 }])("refuse une configuration invalide %j", (settings) => {
    expect(() => validatePassiveConfiguration(settings)).toThrow();
  });
  it("expose le contrat JSON de l’API sans valeur calculée côté client", () => {
    expect(serializePassiveSnapshot({ stock: 7, maxStock: 10, intervalSeconds: 900, nextGenerationAt: new Date("2026-10-09T13:15:00Z"), serverTime: now }))
      .toEqual({ stock: 7, maxStock: 10, intervalSeconds: 900, nextGenerationAt: "2026-10-09T13:15:00.000Z", serverTime: "2026-10-12T12:00:00.000Z" });
    expect(serializePassiveSnapshot({ stock: 10, maxStock: 10, intervalSeconds: 900, nextGenerationAt: null, serverTime: now }).nextGenerationAt).toBeNull();
  });
});
