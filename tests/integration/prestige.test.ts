import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, type Prisma } from "@/generated/prisma/client";
import type { AthleteProvider, ExternalAthlete } from "@/providers/types";
import { applyExternalAthlete } from "@/server/athletes/service";
import { recomputeSportPrestige } from "@/server/athletes/prestige";
import { runImport } from "@/server/imports/service";
import { afterAll, describe, expect, it, vi } from "vitest";

const connectionString = process.env.TEST_DATABASE_URL;
if (!connectionString) throw new Error("TEST_DATABASE_URL est obligatoire pour le prestige.");
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
afterAll(async () => prisma.$disconnect());
async function isolated(test: (tx: Prisma.TransactionClient) => Promise<void>) {
  const rollback = new Error("Annulation volontaire du scénario prestige");
  await expect(prisma.$transaction(async (tx) => { await test(tx); throw rollback; }, { timeout: 15_000 })).rejects.toBe(rollback);
}
const honours = (count: number) => Array.from({ length: count }, (_, index) =>
  ({ externalId: String(index + 1), title: `Titre ${index}`, season: String(2000 + index), team: "Club" }));
function external(sportName: string, externalId: string, extra: Partial<ExternalAthlete> = {}): ExternalAthlete {
  return { provider: "thesportsdb", externalId, fullName: `Athlète ${randomUUID()}`, sportName, nationality: null, birthDate: null,
    teamName: null, position: null, biographyFrench: null, images: [], ...extra };
}

describe("Prestige calculé à partir du palmarès", () => {
  it("stocke le palmarès importé sans l’effacer quand il n’a pas été récupéré ni quand il est protégé", async () => isolated(async (tx) => {
    const admin = await tx.user.create({ data: { role: "ADMIN" } });
    const sport = await tx.sport.create({ data: { slug: randomUUID(), nameFr: "Sport prestige", providerName: `Prestige ${randomUUID()}` } });
    const source = external(sport.providerName, randomUUID(), { honours: honours(2) });
    const { athleteId } = await applyExternalAthlete(tx, source, { actorId: admin.id });
    const stored = await tx.athlete.findUniqueOrThrow({ where: { id: athleteId } });
    expect(stored.achievements).toEqual([{ title: "Titre 0", year: "2000", team: "Club", honourId: "1" },
      { title: "Titre 1", year: "2001", team: "Club", honourId: "2" }]);
    await applyExternalAthlete(tx, { ...source, honours: undefined }, { actorId: admin.id });
    expect((await tx.athlete.findUniqueOrThrow({ where: { id: athleteId } })).achievements).toEqual(stored.achievements);
    await applyExternalAthlete(tx, { ...source, honours: [] }, { actorId: admin.id });
    expect((await tx.athlete.findUniqueOrThrow({ where: { id: athleteId } })).achievements).toEqual([]);
    await tx.athlete.update({ where: { id: athleteId }, data: { achievements: ["Correction admin"], administratorOverrides: { achievements: true } } });
    await applyExternalAthlete(tx, { ...source, honours: honours(4) }, { actorId: admin.id });
    expect((await tx.athlete.findUniqueOrThrow({ where: { id: athleteId } })).achievements).toEqual(["Correction admin"]);
  }));

  it("classe les athlètes d’un même sport, préserve la surcharge et n’influence pas les autres sports", async () => isolated(async (tx) => {
    const admin = await tx.user.create({ data: { role: "ADMIN" } });
    const player = await tx.user.create({ data: {} });
    const sport = await tx.sport.create({ data: { slug: randomUUID(), nameFr: "Sport A", providerName: "A" } });
    const otherSport = await tx.sport.create({ data: { slug: randomUUID(), nameFr: "Sport B", providerName: "B" } });
    const athlete = (sportId: string, count: number, data: Partial<Prisma.AthleteUncheckedCreateInput> = {}) => tx.athlete.create({ data: {
      name: `Athlète ${randomUUID()}`, sportId, achievements: honours(count).map((honour) => ({ title: honour.title, year: honour.season })), ...data } });
    const none = await athlete(sport.id, 0, { prestigeScore: 40 });
    const few = await athlete(sport.id, 1);
    const many = await athlete(sport.id, 5, { prestigeOverride: 12 });
    const elsewhere = await athlete(otherSport.id, 5, { prestigeScore: 7 });
    expect(await recomputeSportPrestige(tx, sport.id, admin.id)).toEqual({ sportId: sport.id, athletes: 3, changed: 3, revalued: 0 });
    const scores = Object.fromEntries((await tx.athlete.findMany({ where: { id: { in: [none.id, few.id, many.id, elsewhere.id] } } }))
      .map((row) => [row.id, [row.prestigeScore, row.prestigeOverride]]));
    expect(scores).toEqual({ [none.id]: [0, null], [few.id]: [50, null], [many.id]: [83, 12], [elsewhere.id]: [7, null] });
    expect(await recomputeSportPrestige(tx, sport.id, admin.id)).toMatchObject({ changed: 0 });
    expect(await tx.adminAuditLog.count({ where: { action: "PRESTIGE_RECOMPUTE", entityId: sport.id } })).toBe(2);
    await expect(recomputeSportPrestige(tx, sport.id, player.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
  }));
});

describe("Import avec palmarès", () => {
  it("récupère le palmarès, recalcule le sport et termine l’import même si le palmarès échoue", async () => {
    const token = randomUUID();
    const admin = await prisma.user.create({ data: { role: "ADMIN" } });
    const sport = await prisma.sport.create({ data: { slug: `prestige-${token}`, providerName: `Prestige ${token}`, nameFr: "Sport prestige" } });
    const getHonours = vi.fn().mockResolvedValue(honours(3).map(({ externalId, title, season, team }) => ({ externalId, title, season, team })));
    const ids = [`${Date.now()}1`, `${Date.now()}2`];
    const provider: AthleteProvider = { capabilities: { lookup: true, search: true, listSports: true, athletesBySport: false, honours: true },
      getAthlete: async (id) => external(sport.providerName, id), getHonours, getSports: async () => [], searchAthletes: async () => [] };
    const dependencies = { client: prisma, provider: () => provider, reserveProvider: async () => {} };
    try {
      const first = await runImport(admin.id, randomUUID(), { kind: "athlete", externalId: ids[0]! }, dependencies);
      expect(first.job).toMatchObject({ status: "COMPLETED", result: { honours: 3, prestige: { sportId: sport.id, athletes: 1 } } });
      expect(getHonours).toHaveBeenCalledWith(ids[0]);
      const athlete = await prisma.athlete.findFirstOrThrow({ where: { sportId: sport.id } });
      expect(athlete.prestigeScore).toBe(50);
      expect(athlete.achievements).toHaveLength(3);
      getHonours.mockRejectedValue(new Error("429"));
      const second = await runImport(admin.id, randomUUID(), { kind: "athlete", externalId: ids[1]! }, dependencies);
      expect(second.job).toMatchObject({ status: "COMPLETED", result: { honours: null, prestige: { athletes: 2 } } });
      expect((await prisma.athlete.findUniqueOrThrow({ where: { id: athlete.id } })).prestigeScore).toBe(75);
    } finally {
      await prisma.$transaction(async (tx) => {
        const athletes = await tx.athlete.findMany({ where: { sportId: sport.id }, select: { id: true } });
        await tx.athleteExternalId.deleteMany({ where: { athleteId: { in: athletes.map((row) => row.id) } } });
        await tx.athlete.deleteMany({ where: { sportId: sport.id } });
        await tx.adminAuditLog.deleteMany({ where: { actorId: admin.id } });
        await tx.importJob.deleteMany({ where: { actorId: admin.id } });
        await tx.sport.delete({ where: { id: sport.id } });
        await tx.rateLimitBucket.deleteMany({ where: { key: { contains: admin.id } } });
        await tx.user.delete({ where: { id: admin.id } });
      });
    }
  });
});
