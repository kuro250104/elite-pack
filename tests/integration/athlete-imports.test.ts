import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { applyExternalAthlete, updateAthlete } from "@/server/athletes/service";
import type { ExternalAthlete } from "@/providers/types";
import { afterAll, describe, expect, it } from "vitest";
const connectionString = process.env.TEST_DATABASE_URL;
if (!connectionString) throw new Error("TEST_DATABASE_URL est obligatoire.");
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
afterAll(async () => prisma.$disconnect());
function payload(name: string): ExternalAthlete {
  return { provider: "thesportsdb", externalId: randomUUID(), fullName: name,
    sportName: "Sport test", birthDate: "1990-01-02", nationality: "France", teamName: "Équipe test",
    position: null, biographyFrench: null, images: [{ source: "thesportsdb", originalUrl: "https://example.invalid/image.jpg",
      license: null, attribution: null, usageRestrictions: null, approvedForDisplay: false }] };
}
describe("importation et corrections athlètes atomiques", () => {
  it("déduplique, demande une revue intersources et préserve les corrections", async () => {
    const rollback = new Error("Annulation volontaire");
    const name = `Test ${randomUUID()}`;
    await expect(prisma.$transaction(async (tx) => {
      const admin = await tx.user.create({ data: { role: "ADMIN" } });
      const sport = await tx.sport.create({ data: { slug: randomUUID(), nameFr: "Sport test", providerName: `Sport test ${randomUUID()}` } });
      const external = { ...payload(name), sportName: sport.providerName };
      const first = await applyExternalAthlete(tx, external, { actorId: admin.id });
      expect(first.action).toBe("created");
      const repeat = await applyExternalAthlete(tx, external, { actorId: admin.id });
      expect(repeat).toEqual({ athleteId: first.athleteId, action: "updated" });
      const secondary = { ...external, provider: "wikidata", externalId: randomUUID() };
      await expect(applyExternalAthlete(tx, secondary, { actorId: admin.id })).rejects.toMatchObject({ code: "IDENTITY_REVIEW_REQUIRED" });
      expect(await applyExternalAthlete(tx, secondary, { actorId: admin.id, targetAthleteId: first.athleteId })).toEqual({ athleteId: first.athleteId, action: "linked" });
      await updateAthlete(tx, first.athleteId, { name: "Nom corrigé", nationality: null, prestigeOverride: 99, active: false }, admin.id);
      await applyExternalAthlete(tx, { ...external, teamName: null }, { actorId: admin.id });
      const athlete = await tx.athlete.findUniqueOrThrow({ where: { id: first.athleteId }, include: { image: true, externalIds: true } });
      expect(athlete).toMatchObject({ name: "Nom corrigé", nationality: null, currentTeam: "Équipe test", prestigeOverride: 99, active: false });
      expect(athlete.externalIds).toHaveLength(2);
      expect(athlete.image?.approvedForDisplay).toBe(false);
      expect(await tx.adminAuditLog.count({ where: { entityId: first.athleteId } })).toBe(5);
      throw rollback;
    })).rejects.toBe(rollback);
    expect(await prisma.athlete.count({ where: { name } })).toBe(0);
  });

  it("refuse les joueurs et les sports non associés sans modification", async () => {
    const rollback = new Error("Annulation volontaire");
    await expect(prisma.$transaction(async (tx) => {
      const player = await tx.user.create({ data: {} });
      const admin = await tx.user.create({ data: { role: "ADMIN" } });
      const external = { ...payload(`Test ${randomUUID()}`), sportName: randomUUID() };
      await expect(applyExternalAthlete(tx, external, { actorId: player.id })).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(applyExternalAthlete(tx, external, { actorId: admin.id })).rejects.toMatchObject({ code: "SPORT_MAPPING_REQUIRED" });
      expect(await tx.athleteExternalId.count({ where: { externalId: external.externalId } })).toBe(0);
      throw rollback;
    })).rejects.toBe(rollback);
  });
});

describe("concurrence des identités importées", () => {
  it("ne crée qu’un athlète pour deux imports simultanés puis bloque un homonyme intersource", async () => {
    // Committed, uniquely scoped fixtures are necessary for independent transactions.
    const key = randomUUID();
    const admin = await prisma.user.create({ data: { id: `athlete-admin-${key}`, role: "ADMIN" } });
    const sport = await prisma.sport.create({ data: { slug: `athlete-sport-${key}`, nameFr: "Sport de test", providerName: `Sport ${key}` } });
    const external = { ...payload(`Athlète ${key}`), sportName: sport.providerName };
    try {
      const results = await Promise.all([
        prisma.$transaction((tx) => applyExternalAthlete(tx, external, { actorId: admin.id })),
        prisma.$transaction((tx) => applyExternalAthlete(tx, external, { actorId: admin.id })),
      ]);
      expect(new Set(results.map((result) => result.athleteId)).size).toBe(1);
      expect(results.map((result) => result.action).sort()).toEqual(["created", "updated"]);
      expect(await prisma.athlete.count({ where: { sportId: sport.id } })).toBe(1);
      const another = { ...external, fullName: `Autre ${key}`, externalId: randomUUID() };
      const outcomes = await Promise.allSettled([
        prisma.$transaction((tx) => applyExternalAthlete(tx, another, { actorId: admin.id })),
        prisma.$transaction((tx) => applyExternalAthlete(tx, { ...another, provider: "wikidata", externalId: randomUUID() }, { actorId: admin.id })),
      ]);
      expect(outcomes.filter((result) => result.status === "fulfilled")).toHaveLength(1);
      const rejected = outcomes.find((result) => result.status === "rejected");
      expect(rejected?.status === "rejected" ? rejected.reason : null).toMatchObject({ code: "IDENTITY_REVIEW_REQUIRED" });
      expect(await prisma.athlete.count({ where: { sportId: sport.id } })).toBe(2);
    } finally {
      // Only this test's own UUID-scoped records are removed; no shared data is reset.
      await prisma.$transaction(async (tx) => {
        await tx.adminAuditLog.deleteMany({ where: { actorId: admin.id } });
        await tx.athleteImage.deleteMany({ where: { athlete: { sportId: sport.id } } });
        await tx.athleteExternalId.deleteMany({ where: { athlete: { sportId: sport.id } } });
        await tx.athlete.deleteMany({ where: { sportId: sport.id } });
        await tx.sport.delete({ where: { id: sport.id } });
        await tx.user.delete({ where: { id: admin.id } });
      });
    }
  });
});
