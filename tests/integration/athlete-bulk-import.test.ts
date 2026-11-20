import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { ProviderRequestError, type AthleteProvider, type ExternalAthlete } from "@/providers/types";
import { runBulkImport } from "@/server/imports/bulk";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";

const connectionString = process.env.TEST_DATABASE_URL;
if (!connectionString) throw new Error("TEST_DATABASE_URL est obligatoire pour l’import en masse.");
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
afterAll(async () => prisma.$disconnect());

// Each athlete is committed on its own, as in production, so fixtures are cleaned explicitly.
const created: { users: string[]; sportNames: string[]; boosters: string[] } = { users: [], sportNames: [], boosters: [] };
afterEach(async () => {
  await prisma.$transaction(async (tx) => {
    const sports = (await tx.sport.findMany({ where: { providerName: { in: created.sportNames } }, select: { id: true } })).map((row) => row.id);
    const athletes = (await tx.athlete.findMany({ where: { sportId: { in: sports } }, select: { id: true } })).map((row) => row.id);
    await tx.boosterEdition.deleteMany({ where: { boosterTypeId: { in: created.boosters } } });
    await tx.boosterSport.deleteMany({ where: { boosterTypeId: { in: created.boosters } } });
    await tx.boosterType.deleteMany({ where: { id: { in: created.boosters } } });
    await tx.cardEdition.deleteMany({ where: { athleteId: { in: athletes } } });
    await tx.athleteImage.deleteMany({ where: { athleteId: { in: athletes } } });
    await tx.athleteExternalId.deleteMany({ where: { athleteId: { in: athletes } } });
    await tx.athlete.deleteMany({ where: { id: { in: athletes } } });
    await tx.sport.deleteMany({ where: { id: { in: sports } } });
    await tx.adminAuditLog.deleteMany({ where: { actorId: { in: created.users } } });
    await tx.user.deleteMany({ where: { id: { in: created.users } } });
  });
  created.users = []; created.sportNames = []; created.boosters = [];
});

async function fixture(role: "ADMIN" | "PLAYER" = "ADMIN") {
  const admin = await prisma.user.create({ data: { role, name: "Admin import en masse" } });
  created.users.push(admin.id);
  const booster = await prisma.boosterType.create({ data: { slug: randomUUID(), nameFr: "Booster test", category: "MULTISPORT", active: true } });
  created.boosters.push(booster.id);
  // Unique provider names: the sport lookup is global and the shared test database may hold real sports.
  const sportName = `Basket ${randomUUID()}`;
  created.sportNames.push(sportName);
  return { admin, booster, sportName };
}

const externalId = () => String(Math.floor(Math.random() * 1e12));
function athlete(name: string, sportName: string | null, id = externalId()): ExternalAthlete {
  return { provider: "thesportsdb", externalId: id, fullName: name, sportName, nationality: "France", birthDate: null,
    teamName: "Équipe A", position: "Meneur", biographyFrench: null, images: [] };
}
function provider(rosters: Record<string, ExternalAthlete[]>, sportName: string, overrides: Partial<AthleteProvider> = {}): AthleteProvider {
  return { capabilities: { lookup: true, search: true, listSports: true, athletesBySport: false, honours: true, teams: true },
    getTeamsByLeague: vi.fn(async () => Object.keys(rosters).map((team) => ({ externalId: team, name: team, sportName }))),
    getTeamPlayers: vi.fn(async (team: string) => rosters[team]!.map((row) => ({ ...row }))),
    getHonours: vi.fn(async (id: string) => id.endsWith("7") ? [{ externalId: "1", title: "Titre", season: "2026", team: null }] : []),
    getAthlete: async () => null, getSports: async () => [], searchAthletes: async () => [], ...overrides };
}
const instant = { reserveProvider: async () => {}, wait: async () => {} };

describe("Import en masse des athlètes", () => {
  it("importe les effectifs d’une ligue, crée le sport manquant et rend chaque athlète jouable", async () => {
    const data = await fixture();
    const source = provider({ "1": [athlete("Joueur Un", data.sportName), athlete("Joueur Deux", null)], "2": [athlete("Joueur Trois", data.sportName)] }, data.sportName);
    const summary = await runBulkImport(data.admin.id, { leagues: ["Ligue test"], boosterTypeId: data.booster.id, activateSports: true, minIntervalMs: 2_100 },
      { client: prisma, provider: () => source, ...instant });
    expect(summary.totals).toEqual({ players: 3, created: 3, updated: 0, skipped: 0, failed: 0 });
    // The sport is taken from the team when the player omits it, and created once.
    const sport = await prisma.sport.findFirstOrThrow({ where: { providerName: data.sportName } });
    expect(sport).toMatchObject({ providerId: null, active: false });
    expect(summary.sports).toEqual([{ sportId: sport.id, active: false, error: "TRANSLATION_REQUIRED" }]);
    const athletes = await prisma.athlete.findMany({ where: { sportId: sport.id }, include: { editions: true } });
    expect(athletes).toHaveLength(3);
    for (const row of athletes) expect(row.editions.map((edition) => edition.rarity).sort()).toEqual(["COMMON", "EPIC", "LEGENDARY", "MYTHIC", "RARE", "UNCOMMON"]);
    expect(athletes.every((row) => row.editions.every((edition) => edition.active && edition.maxSupply === null))).toBe(true);
    expect(await prisma.boosterEdition.count({ where: { boosterTypeId: data.booster.id } })).toBe(18);
    expect(await prisma.boosterSport.findMany({ where: { boosterTypeId: data.booster.id } })).toEqual([expect.objectContaining({ sportId: sport.id })]);
    expect(source.getHonours).toHaveBeenCalledTimes(3);
    expect(await prisma.adminAuditLog.count({ where: { actorId: data.admin.id, action: "ATHLETE_BULK_IMPORT" } })).toBe(1);
    expect(await prisma.adminAuditLog.count({ where: { actorId: data.admin.id, action: "SPORT_CREATED_FROM_IMPORT" } })).toBe(1);
  });

  it("saute les athlètes déjà liés sans rappeler le fournisseur et préserve les éditions modifiées", async () => {
    const data = await fixture();
    const first = athlete("Déjà importé", data.sportName);
    const source = provider({ "1": [first] }, data.sportName);
    await runBulkImport(data.admin.id, { leagues: ["Ligue test"], boosterTypeId: data.booster.id }, { client: prisma, provider: () => source, ...instant });
    const { athleteId } = await prisma.athleteExternalId.findUniqueOrThrow({ where: { provider_externalId: { provider: "THESPORTSDB", externalId: first.externalId } } });
    await prisma.cardEdition.update({ where: { id: `discovery-${athleteId}-mythic` }, data: { name: "Édition admin", maxSupply: 10 } });
    const again = await runBulkImport(data.admin.id, { leagues: ["Ligue test"], boosterTypeId: data.booster.id }, { client: prisma, provider: () => source, ...instant });
    expect(again.totals).toMatchObject({ players: 1, created: 0, skipped: 1 });
    expect(again.editionsCreated).toBe(0);
    expect(source.getHonours).toHaveBeenCalledTimes(1);
    expect(await prisma.cardEdition.findUniqueOrThrow({ where: { id: `discovery-${athleteId}-mythic` } })).toMatchObject({ name: "Édition admin", maxSupply: 10 });
  });

  it("attend après un refus 429 puis reprend, et poursuit après l’échec d’un homonyme", async () => {
    const data = await fixture();
    const roster = [athlete("Homonyme", data.sportName), athlete("Homonyme", data.sportName), athlete("Autre", data.sportName)];
    let refused = false;
    const source = provider({ "1": roster }, data.sportName, { getTeamPlayers: vi.fn(async () => {
      if (!refused) { refused = true; throw new ProviderRequestError("Le fournisseur sportif a refusé la requête (429).", 429); }
      return roster.map((row) => ({ ...row }));
    }) });
    const wait = vi.fn(async () => {});
    const summary = await runBulkImport(data.admin.id, { leagues: ["Ligue test"], boosterTypeId: data.booster.id, honours: false },
      { client: prisma, provider: () => source, reserveProvider: async () => {}, wait });
    expect(wait).toHaveBeenCalledWith(65_000);
    expect(summary.totals).toMatchObject({ players: 3, created: 2, failed: 1 });
    expect(summary.failures).toEqual([expect.objectContaining({ name: "Homonyme", code: "IDENTITY_REVIEW_REQUIRED" })]);
    expect(source.getHonours).not.toHaveBeenCalled();
  });

  it("réessaie après une coupure réseau et ne reprend que les palmarès manquants", async () => {
    const data = await fixture();
    const done = athlete("Palmarès connu", data.sportName, "1000000007");
    const missing = athlete("Palmarès manquant", data.sportName);
    const first = provider({ "1": [done, missing] }, data.sportName);
    await runBulkImport(data.admin.id, { leagues: ["Ligue test"], boosterTypeId: data.booster.id, honours: false }, { client: prisma, provider: () => first, ...instant });
    await prisma.athlete.updateMany({ where: { name: "Palmarès connu" }, data: { achievements: [] } });
    let offline = true;
    const second = provider({ "1": [done, missing] }, data.sportName, { getTeamPlayers: vi.fn(async () => {
      if (offline) { offline = false; throw new Error("Le fournisseur sportif est temporairement indisponible."); }
      return [done, missing].map((row) => ({ ...row }));
    }) });
    const wait = vi.fn(async () => {});
    const summary = await runBulkImport(data.admin.id, { leagues: ["Ligue test"], boosterTypeId: data.booster.id, refreshExisting: true, missingHonoursOnly: true },
      { client: prisma, provider: () => second, reserveProvider: async () => {}, wait });
    expect(wait).toHaveBeenCalledWith(30_000);
    expect(summary.totals).toMatchObject({ players: 2, updated: 1, skipped: 1, failed: 0 });
    expect(second.getHonours).toHaveBeenCalledTimes(1);
    expect(second.getHonours).toHaveBeenCalledWith(missing.externalId);
  });

  it("refuse un joueur sans rôle administrateur avant tout appel au fournisseur", async () => {
    const data = await fixture("PLAYER");
    const source = provider({ "1": [athlete("Joueur", data.sportName)] }, data.sportName);
    await expect(runBulkImport(data.admin.id, { leagues: ["Ligue test"], boosterTypeId: data.booster.id }, { client: prisma, provider: () => source, ...instant }))
      .rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(source.getTeamsByLeague).not.toHaveBeenCalled();
  });
});
