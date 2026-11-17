import { describe, expect, it, vi } from "vitest";
import { bankResalePrice, editionBaseValue } from "@/server/economy/valuation";

vi.mock("server-only", () => ({}));

describe("Valeur des éditions", () => {
  it("multiplie la valeur de rareté par (100 + prestige) / 100 en entiers, arrondi vers le bas", () => {
    expect(editionBaseValue(BigInt(10), 0)).toBe(BigInt(10));
    expect(editionBaseValue(BigInt(10), 55)).toBe(BigInt(15));
    expect(editionBaseValue(BigInt(2000), 100)).toBe(BigInt(4000));
    expect(editionBaseValue(BigInt(75), 33)).toBe(BigInt(99));
  });

  it("borne le prestige entre 0 et 100", () => {
    expect(editionBaseValue(BigInt(100), -20)).toBe(BigInt(100));
    expect(editionBaseValue(BigInt(100), 250)).toBe(BigInt(200));
  });
});

describe("Prix de rachat par la banque", () => {
  it("applique le taux en points de base, arrondi vers le bas, sans flottant", () => {
    expect(bankResalePrice(BigInt(1000), 6000)).toBe(BigInt(600));
    expect(bankResalePrice(BigInt(15), 6000)).toBe(BigInt(9));
    expect(bankResalePrice(BigInt(0), 6000)).toBe(BigInt(0));
    expect(bankResalePrice(BigInt("90071992547409930"), 6000)).toBe(BigInt("54043195528445958"));
  });

  it("refuse un taux hors de 0 à 100 %", () => {
    expect(() => bankResalePrice(BigInt(10), -1)).toThrow();
    expect(() => bankResalePrice(BigInt(10), 10_001)).toThrow();
    expect(() => bankResalePrice(BigInt(10), 12.5)).toThrow();
  });
});
