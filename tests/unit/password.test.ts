import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "@/server/auth/password";

describe("Mot de passe scrypt", () => {
  it("utilise des sels uniques et vérifie uniquement le mot de passe exact", async () => {
    const password = " mot de passe de test ";
    const first = await hashPassword(password);
    const second = await hashPassword(password);
    expect(first).not.toBe(second);
    expect(first).toMatch(/^scrypt\$32768\$8\$3\$[A-Za-z0-9_-]{22}\$[A-Za-z0-9_-]{86}$/u);
    expect(first).not.toContain(password);
    expect(await verifyPassword(password, first)).toBe(true);
    expect(await verifyPassword(password.trim(), first)).toBe(false);
  });
  it("refuse un hash absent, corrompu ou des paramètres modifiés", async () => {
    const hash = await hashPassword("mot de passe de test");
    expect(await verifyPassword("mot de passe de test", null)).toBe(false);
    expect(await verifyPassword("mot de passe de test", "invalide")).toBe(false);
    expect(await verifyPassword("mot de passe de test", hash.replace("32768", "16384"))).toBe(false);
  });
  it("borne les entrées avant tout calcul coûteux", async () => {
    await expect(hashPassword("court")).rejects.toThrow("Mot de passe invalide");
    await expect(hashPassword("x".repeat(129))).rejects.toThrow("Mot de passe invalide");
    expect(await verifyPassword("", null)).toBe(false);
    expect(await verifyPassword("x".repeat(129), null)).toBe(false);
  });
});
