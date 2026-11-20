import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import type { CommonsFile, WikidataPerson } from "@/providers/wikimedia/client";
import { runCommonsImageImport, type CommonsSource } from "@/server/images/commons-import";
import { displayableAthleteImage } from "@/server/images/presentation";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";

const connectionString = process.env.TEST_DATABASE_URL;
if (!connectionString) throw new Error("TEST_DATABASE_URL est obligatoire pour les portraits Commons.");
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
afterAll(async () => prisma.$disconnect());

const created: { users: string[]; sports: string[] } = { users: [], sports: [] };
afterEach(async () => {
  await prisma.$transaction(async (tx) => {
    const athletes = (await tx.athlete.findMany({ where: { sportId: { in: created.sports } }, select: { id: true } })).map((row) => row.id);
    await tx.athleteImage.deleteMany({ where: { athleteId: { in: athletes } } });
    await tx.athleteExternalId.deleteMany({ where: { athleteId: { in: athletes } } });
    await tx.athlete.deleteMany({ where: { id: { in: athletes } } });
    await tx.sport.deleteMany({ where: { id: { in: created.sports } } });
    await tx.adminAuditLog.deleteMany({ where: { actorId: { in: created.users } } });
    await tx.user.deleteMany({ where: { id: { in: created.users } } });
  });
  created.users = []; created.sports = [];
});

// Each run is scoped to the fixture's sport: the shared test database may hold real athletes.
async function fixture(role: "ADMIN" | "PLAYER" = "ADMIN") {
  const admin = await prisma.user.create({ data: { role, name: "Admin portraits" } });
  created.users.push(admin.id);
  const sport = await prisma.sport.create({ data: { slug: randomUUID(), nameFr: "Sport portraits", providerName: `Portraits ${randomUUID()}`, active: true } });
  created.sports.push(sport.id);
  const athlete = (name: string, birthDate: string | null, data: object = {}) => prisma.athlete.create({ data: {
    name, sportId: sport.id, birthDate: birthDate ? new Date(`${birthDate}T00:00:00Z`) : null, ...data } });
  return { admin, athlete, sportId: sport.id };
}

const qid = () => `Q${Math.floor(Math.random() * 1e12)}`;
const file = (name: string, overrides: Partial<CommonsFile> = {}): CommonsFile => ({
  title: `File:${name}`, fileUrl: `https://upload.wikimedia.org/wikipedia/commons/a/ab/${name.replace(/ /g, "_")}`,
  descriptionUrl: `https://commons.wikimedia.org/wiki/File:${name.replace(/ /g, "_")}`, width: 2000, mime: "image/jpeg",
  licenseShortName: "CC BY-SA 4.0", licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0", restrictions: null,
  artistHtml: "<a href=\"//commons.wikimedia.org/wiki/User:Photographe\">Photographe</a>", ...overrides });
function source(people: Record<string, WikidataPerson[]>, files: CommonsFile[]): CommonsSource {
  const byQid = new Map(Object.values(people).flat().map((person) => [person.qid, person]));
  return { searchPeople: vi.fn(async (name: string) => (people[name] ?? []).map((person) => person.qid)),
    getPeople: vi.fn(async (ids: string[]) => ids.flatMap((id) => byQid.get(id) ?? [])),
    getCommonsFiles: vi.fn(async (names: string[]) => files.filter((row) => names.includes(row.title.slice(5)))) };
}
const person = (birthDate: string, imageFile: string | null, overrides: Partial<WikidataPerson> = {}): WikidataPerson =>
  ({ qid: qid(), human: true, birthDates: [birthDate], imageFile, ...overrides });

describe("Portraits Wikimedia Commons", () => {
  it("approuve un portrait sous licence compatible, avec auteur, en passant par la revue auditée", async () => {
    const data = await fixture();
    const star = await data.athlete("Joueur Étoile", "1998-12-20");
    const match = person("1998-12-20", "Joueur Étoile.jpg");
    const wiki = source({ "Joueur Étoile": [person("1998-12-21", "Autre.jpg"), match] }, [file("Joueur Étoile.jpg", { restrictions: "personality" })]);
    const summary = await runCommonsImageImport(data.admin.id, { ...{ limit: 1 }, sportId: data.sportId }, { client: prisma, source: wiki });
    expect(summary).toMatchObject({ candidates: 1, approved: 1 });
    const image = await prisma.athleteImage.findUniqueOrThrow({ where: { athleteId: star.id } });
    expect(displayableAthleteImage(image)).toEqual({ url: "https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Joueur_%C3%89toile.jpg/500px-Joueur_%C3%89toile.jpg",
      originalUrl: "https://commons.wikimedia.org/wiki/File:Joueur_Étoile.jpg", attribution: "Photographe",
      license: "CC-BY-SA-4.0", licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/" });
    expect(image).toMatchObject({ reviewedById: data.admin.id, source: "Wikimedia Commons" });
    expect(await prisma.athleteExternalId.findUnique({ where: { athleteId_provider: { athleteId: star.id, provider: "WIKIDATA" } } }))
      .toMatchObject({ externalId: match.qid });
    expect(await prisma.adminAuditLog.count({ where: { actorId: data.admin.id, action: "IMAGE_APPROVE", entityId: image.id } })).toBe(1);
  });

  it("remplace une référence TheSportsDB non revue mais jamais une décision administrateur", async () => {
    const data = await fixture();
    const pending = await data.athlete("Joueur En Attente", "1990-01-01", { image: { create: { url: "https://www.thesportsdb.com/images/media/player/thumb/x.jpg",
      originalUrl: "https://www.thesportsdb.com/images/media/player/thumb/x.jpg", source: "thesportsdb" } } });
    const rejected = await data.athlete("Joueur Refusé", "1990-01-02", { image: { create: { url: "https://www.thesportsdb.com/images/media/player/thumb/y.jpg",
      originalUrl: "https://www.thesportsdb.com/images/media/player/thumb/y.jpg", source: "thesportsdb", reviewedById: data.admin.id,
      reviewedAt: new Date(), decisionReason: "Droits inconnus" } } });
    const wiki = source({ "Joueur En Attente": [person("1990-01-01", "A.jpg")], "Joueur Refusé": [person("1990-01-02", "B.jpg")] }, [file("A.jpg", { licenseShortName: "CC BY 2.0", licenseUrl: "https://creativecommons.org/licenses/by/2.0" }), file("B.jpg")]);
    const summary = await runCommonsImageImport(data.admin.id, { ...{ limit: 2 }, sportId: data.sportId }, { client: prisma, source: wiki });
    expect(summary).toMatchObject({ candidates: 1, approved: 1 });
    expect(await prisma.athleteImage.findUniqueOrThrow({ where: { athleteId: pending.id } })).toMatchObject({ source: "Wikimedia Commons", approvedForDisplay: true });
    expect(await prisma.athleteImage.findUniqueOrThrow({ where: { athleteId: rejected.id } })).toMatchObject({ source: "thesportsdb", decisionReason: "Droits inconnus" });
  });

  it("laisse en revue manuelle une licence incompatible, sans auteur ou avec restriction, et ignore les identités incertaines", async () => {
    const data = await fixture();
    const nc = await data.athlete("Joueur NC", "1991-01-01");
    const anonymous = await data.athlete("Joueur Anonyme", "1991-01-02");
    const restricted = await data.athlete("Joueur Restreint", "1991-01-03");
    const twins = await data.athlete("Joueur Ambigu", "1991-01-04");
    const robot = await data.athlete("Joueur Robot", "1991-01-05");
    await data.athlete("Joueur Sans Date", null);
    const wiki = source({
      "Joueur NC": [person("1991-01-01", "NC.jpg")], "Joueur Anonyme": [person("1991-01-02", "Anonyme.jpg")],
      "Joueur Restreint": [person("1991-01-03", "Restreint.jpg")],
      "Joueur Ambigu": [person("1991-01-04", "X.jpg"), person("1991-01-04", "Y.jpg")],
      "Joueur Robot": [person("1991-01-05", "Robot.jpg", { human: false })],
    }, [file("NC.jpg", { licenseShortName: "CC BY-NC 4.0", licenseUrl: "https://creativecommons.org/licenses/by-nc/4.0/" }),
      file("Anonyme.jpg", { artistHtml: null }), file("Restreint.jpg", { restrictions: "personality|trademarked" })]);
    const summary = await runCommonsImageImport(data.admin.id, { ...{ limit: 5 }, sportId: data.sportId }, { client: prisma, source: wiki });
    expect(summary).toMatchObject({ candidates: 5, approved: 0, "pending-review": 3, ambiguous: 1, "no-match": 1 });
    for (const athlete of [nc, anonymous, restricted]) {
      const image = await prisma.athleteImage.findUniqueOrThrow({ where: { athleteId: athlete.id } });
      expect(image.approvedForDisplay).toBe(false);
      expect(displayableAthleteImage(image)).toBeNull();
    }
    expect(await prisma.athleteImage.count({ where: { athleteId: { in: [twins.id, robot.id] } } })).toBe(0);
  });

  it("refuse un joueur sans rôle administrateur avant tout appel réseau", async () => {
    const data = await fixture("PLAYER");
    const wiki = source({}, []);
    await expect(runCommonsImageImport(data.admin.id, {}, { client: prisma, source: wiki })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(wiki.searchPeople).not.toHaveBeenCalled();
  });
});
