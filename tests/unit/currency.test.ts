import { describe, expect, it } from "vitest";
import { formatCoins } from "@/lib/currency";

describe("Affichage de la monnaie virtuelle", () => {
  it("formate les entiers en français et accorde le nom de la monnaie", () => {
    const space = (value: string) => value.replace(/\s/gu, " ");
    expect(formatCoins(0)).toBe("0 pièce");
    expect(formatCoins(1)).toBe("1 pièce");
    expect(formatCoins(2)).toBe("2 pièces");
    expect(space(formatCoins(1240))).toBe("1 240 pièces");
    expect(space(formatCoins(BigInt("9007199254740993")))).toBe("9 007 199 254 740 993 pièces");
  });
});
