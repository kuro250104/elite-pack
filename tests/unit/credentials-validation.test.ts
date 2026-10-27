import { describe, expect, it } from "vitest";
import { loginSchema, registrationSchema } from "@/server/auth/validation";

const input = { name: "Joueur", email: "  JOUEUR@Example.com  ", password: " secret assez long ", passwordConfirmation: " secret assez long " };
describe("Entrées de connexion et inscription", () => {
  it("normalise l’email et conserve exactement le mot de passe", () => {
    expect(registrationSchema.parse(input)).toMatchObject({ email: "joueur@example.com", password: input.password });
    expect(loginSchema.parse({ email: input.email, password: " secret " })).toEqual({ email: "joueur@example.com", password: " secret " });
  });
  it("refuse rôle et champs inconnus", () => {
    expect(registrationSchema.safeParse({ ...input, role: "ADMIN" }).success).toBe(false);
    expect(loginSchema.safeParse({ email: input.email, password: "a", passwordHash: "x" }).success).toBe(false);
  });
  it("contrôle confirmation, longueur et email", () => {
    for (const patch of [{ passwordConfirmation: "different passphrase" }, { password: "court", passwordConfirmation: "court" },
      { password: "x".repeat(129), passwordConfirmation: "x".repeat(129) }, { email: "invalide" }]) {
      expect(registrationSchema.safeParse({ ...input, ...patch }).success).toBe(false);
    }
    expect(loginSchema.safeParse({ email: input.email, password: "" }).success).toBe(false);
  });
});
