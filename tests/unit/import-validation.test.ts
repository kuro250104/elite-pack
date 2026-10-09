import { describe, expect, it } from "vitest";
import { importCommandSchema, idempotencyKeySchema } from "@/server/imports/validation";
import { frenchSportName } from "@/server/sports/service";
describe("commandes d’import", () => {
  it("refuse identités autorité et champs arbitraires", () => {
    for (const input of [{kind: "sports", actorId: "admin"}, {kind: "athlete", externalId: "../secret"}, {kind: "athlete", externalId: "123", name: "Inventé"}]) expect(importCommandSchema.safeParse(input).success).toBe(false);
  });
  it("n’accepte que des clés bornées", () => {
    expect(idempotencyKeySchema.safeParse("request-1234").success).toBe(true);
    for (const key of ["", "a".repeat(129), "key-with/unsafe"]) expect(idempotencyKeySchema.safeParse(key).success).toBe(false);
  });
  it("traduit les sports connus sans inventer la traduction des autres", () => {
    expect(frenchSportName({externalId: "1", providerName: "Soccer", category: null})).toBe("Football");
    expect(frenchSportName({externalId: "999", providerName: "Untranslated sport", category: null})).toBe("Sport à traduire (999)");
  });
});
