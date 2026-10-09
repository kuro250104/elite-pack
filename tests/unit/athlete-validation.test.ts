import { describe, expect, it } from "vitest";
import { athletePatchSchema, calendarDateSchema } from "@/server/athletes/validation";
describe("validation administrative athlète", () => {
  it("refuse les jours inexistants et accepte une année bissextile", () => {
    expect(calendarDateSchema.safeParse("2025-02-29").success).toBe(false);
    expect(calendarDateSchema.safeParse("2024-02-29").success).toBe(true);
    expect(calendarDateSchema.safeParse("2024-13-01").success).toBe(false);
  });
  it("protège identifiants, sport, overrides et images", () => {
    for (const field of ["id", "sportId", "administratorOverrides", "image", "prestigeScore"]) {
      expect(athletePatchSchema.safeParse({ [field]: "interdit" }).success).toBe(false);
    }
  });
  it("borne le prestige et refuse un patch vide", () => {
    expect(athletePatchSchema.safeParse({ prestigeOverride: 101 }).success).toBe(false);
    expect(athletePatchSchema.safeParse({ prestigeOverride: 3.5 }).success).toBe(false);
    expect(athletePatchSchema.safeParse({}).success).toBe(false);
    expect(athletePatchSchema.parse({ prestigeOverride: null, active: false })).toEqual({ prestigeOverride: null, active: false });
  });
});
