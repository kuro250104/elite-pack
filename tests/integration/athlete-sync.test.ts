import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import type { AthleteProvider, ExternalAthlete } from "@/providers/types";
import { ApiError } from "@/lib/api/errors";
import { syncAthletes } from "@/server/imports/sync";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";

const connectionString = process.env.TEST_DATABASE_URL;
if (!connectionString) throw new Error("TEST_DATABASE_URL est obligatoire pour la synchronisation.");
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
afterAll(async () => prisma.$disconnect());

// Each import commits its own job, as in production, so fixtures are cleaned explicitly.
const created: { users: string[]; sports: string[] } = { users: [], sports: [] };
afterEach(async () => {
  await prisma.$transaction(async (tx) => {
    const athletes = (await tx.athlete.findMany({ where: { sportId: { in: created.sports } }, select: { id: true } })).map((row) => row.id);
    await tx.athleteExternalId.deleteMany({ where: { athleteId: { in: athletes } } });
    await tx.athlete.deleteMany({ where: { id: { in: athletes } } });
    await tx.sport.deleteMany({ where: { id: { in: created.sports } } });
    await tx.adminAuditLog.deleteMany({ where: { actorId: { in: created.users } } });
    await tx.importJob.deleteMany({ where: { actorId: { in: created.users } } });
    await tx.rateLimitBucket.deleteMany({ where: { OR: created.users.map((id) => ({ key: { contains: id } })) } });
    await tx.user.deleteMany({ where: { id: { in: created.users } } });
  });
  created.users = []; created.sports = [];
});

const day = 24 * 3600 * 1000;
async function fixture() {
  const admin = await prisma.user.create({ data: { role: "ADMIN", name: "Admin synchro" } });
  created.users.push(admin.id);
  const sport = await prisma.sport.create({ data: { slug: randomUUID(), nameFr: "Sport synchro", providerName: `Synchro ${randomUUID()}`, active: true } });
  created.sports.push(sport.id);
  const athlete = async (name: string, importedAt: Date, data: object = {}) => {
    const externalId = String(Math.floor(Math.random() * 1e12));
    const row = await prisma.athlete.create({ data: { name, sportId: sport.id, currentTeam: "Ancien club", ...data,
      externalIds: { create: { provider: "THESPORTSDB", externalId, importedAt } } } });
    return { id: row.id, externalId };
  };
  return { admin, sport,
    oldest: await athlete("Plus ancien", new Date(Date.now() - 5 * day)),
    protected: await athlete("Corrigé", new Date(Date.now() - 4 * day), { currentTeam: "Club corrigé", administratorOverrides: { currentTeam: true } }),
    fresh: await athlete("Récent", new Date(Date.now() - 3600 * 1000)),
    retired: await athlete("Inactif", new Date(Date.now() - 6 * day), { active: false }) };
}
function provider(sportName: string, overrides: Partial<AthleteProvider> = {}): AthleteProvider {
  return { capabilities: { lookup: true, search: true, listSports: true, athletesBySport: false, honours: true },
    getAthlete: vi.fn(async (id: string): Promise<ExternalAthlete> => ({ provider: "thesportsdb", externalId: id,
      fullName: id, sportName, nationality: null, birthDate: null, teamName: "Nouveau club", position: "Attaquant", biographyFrench: null, images: [] })),
    getHonours: vi.fn(async () => [{ externalId: "1", title: "Coupe", season: "2026", team: "Nouveau club" }]),
    getSports: async () => [], searchAthletes: async () => [], ...overrides };
}

describe("Synchronisation des athlètes", () => {
  it("rafraîchit les plus anciens d’abord, saute les récents et inactifs, préserve les corrections et journalise chaque champ", async () => {
    const data = await fixture();
    const source = provider(data.sport.providerName);
    // getAthlete returns the external id as name: keep the stored name by protecting it like an administrator would.
    await prisma.athlete.updateMany({ where: { id: { in: [data.oldest.id, data.protected.id] } }, data: { administratorOverrides: { name: true } } });
    await prisma.athlete.update({ where: { id: data.protected.id }, data: { administratorOverrides: { name: true, currentTeam: true } } });
    const summary = await syncAthletes(data.admin.id, { limit: 10, olderThanHours: 24 }, { client: prisma, provider: () => source, reserveProvider: async () => {} });
    expect(summary).toMatchObject({ candidates: 2, processed: 2, failed: 0, stoppedByQuota: false });
    expect(summary.results.map((row) => [row.name, row.status, row.changed.sort()])).toEqual([
      ["Plus ancien", "COMPLETED", ["achievements", "currentTeam", "position"]], ["Corrigé", "COMPLETED", ["achievements", "position"]]]);
    expect(source.getAthlete).toHaveBeenCalledTimes(2);
    const [oldest, kept] = await Promise.all([data.oldest, data.protected].map((row) => prisma.athlete.findUniqueOrThrow({ where: { id: row.id }, include: { externalIds: true } })));
    expect(oldest).toMatchObject({ name: "Plus ancien", currentTeam: "Nouveau club", position: "Attaquant" });
    expect(kept).toMatchObject({ name: "Corrigé", currentTeam: "Club corrigé" });
    expect(oldest!.externalIds[0]!.importedAt.getTime()).toBeGreaterThan(Date.now() - 60_000);
    const history = await prisma.adminAuditLog.findFirstOrThrow({ where: { action: "ATHLETE_IMPORT_UPDATED", entityId: data.oldest.id } });
    expect((history.after as { changes: object }).changes).toMatchObject({ currentTeam: { before: "Ancien club", after: "Nouveau club" } });
    expect(await prisma.adminAuditLog.count({ where: { action: "ATHLETE_SYNC", actorId: data.admin.id } })).toBe(1);
    expect((await prisma.athlete.findUniqueOrThrow({ where: { id: data.fresh.id } })).currentTeam).toBe("Ancien club");
    expect((await prisma.athlete.findUniqueOrThrow({ where: { id: data.retired.id } })).currentTeam).toBe("Ancien club");
    // Same provider data again: no field is reported as changed (jsonb key order must not cause false changes).
    const again = await syncAthletes(data.admin.id, { limit: 10, olderThanHours: 0 }, { client: prisma, provider: () => source, reserveProvider: async () => {} });
    // The shared test database may hold other linked athletes: only this fixture's rows are asserted.
    expect(again.results.filter((row) => [data.oldest.id, data.protected.id].includes(row.athleteId)).map((row) => [row.status, row.changed]))
      .toEqual([["COMPLETED", []], ["COMPLETED", []]]);
  });

  it("s’arrête au premier refus de quota du fournisseur et refuse un non-administrateur", async () => {
    const data = await fixture();
    const source = provider(data.sport.providerName);
    const summary = await syncAthletes(data.admin.id, { limit: 10, olderThanHours: 24 }, { client: prisma, provider: () => source,
      reserveProvider: async () => { throw new ApiError("RATE_LIMITED", "Trop de requêtes.", 429, 60); } });
    expect(summary).toMatchObject({ candidates: 2, processed: 1, failed: 1, stoppedByQuota: true });
    expect(source.getAthlete).not.toHaveBeenCalled();
    const player = await prisma.user.create({ data: {} });
    created.users.push(player.id);
    await expect(syncAthletes(player.id, {}, { client: prisma })).rejects.toMatchObject({ status: 403 });
    await expect(syncAthletes(data.admin.id, { limit: 0 }, { client: prisma })).rejects.toThrow();
  });
});
