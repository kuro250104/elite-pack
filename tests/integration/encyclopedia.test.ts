import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, type Prisma } from "@/generated/prisma/client";
import { getAthleteSheet, listEncyclopedia } from "@/server/athletes/encyclopedia";
import { afterAll, describe, expect, it } from "vitest";

const connectionString = process.env.TEST_DATABASE_URL;
if (!connectionString) throw new Error("TEST_DATABASE_URL est obligatoire pour l’encyclopédie.");
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
afterAll(async () => prisma.$disconnect());
async function isolated(test: (tx: Prisma.TransactionClient, client: PrismaClient) => Promise<void>) {
  const rollback = new Error("Annulation volontaire du scénario encyclopédie");
  // The encyclopedia only reads, so the transaction client can stand in for the full client.
  await expect(prisma.$transaction(async (tx) => { await test(tx, tx as unknown as PrismaClient); throw rollback; }))
    .rejects.toBe(rollback);
}
async function fixture(tx: Prisma.TransactionClient) {
  const player = await tx.user.create({ data: {} });
  const other = await tx.user.create({ data: {} });
  const sport = await tx.sport.create({ data: { slug: randomUUID(), nameFr: `Sport encyclopédie ${randomUUID()}`, providerName: "Test", active: true } });
  const closed = await tx.sport.create({ data: { slug: randomUUID(), nameFr: "Sport fermé", providerName: "Test" } });
  const star = await tx.athlete.create({ data: { name: "Étoile encyclopédie", sportId: sport.id, nationality: "France", currentTeam: "Club",
    position: "Attaquant", birthDate: new Date("1998-12-20T00:00:00Z"), biography: "Biographie en français.", prestigeScore: 30, prestigeOverride: 88,
    achievements: [{ title: "Coupe du monde", year: 2018 }, "Ballon d’or", { name: "" }, 42],
    statistics: { buts: 300, sélections: 90, nested: { ignored: true } } } });
  const unknown = await tx.athlete.create({ data: { name: "Inconnu encyclopédie", sportId: sport.id, biography: "Secret" } });
  const retired = await tx.athlete.create({ data: { name: "Retraité encyclopédie", sportId: sport.id, active: false } });
  const hidden = await tx.athlete.create({ data: { name: "Caché encyclopédie", sportId: closed.id } });
  await tx.athleteImage.create({ data: { athleteId: star.id, url: "https://example.com/a.jpg", originalUrl: "https://example.com/a.jpg",
    source: "thesportsdb", approvedForDisplay: false } });
  const edition = (athleteId: string, name: string, data: Partial<Prisma.CardEditionUncheckedCreateInput> = {}) =>
    tx.cardEdition.create({ data: { athleteId, name, rarity: "COMMON", active: true, ...data } });
  const standard = await edition(star.id, "Standard");
  const golden = await edition(star.id, "Or", { rarity: "LEGENDARY", maxSupply: 2, mintedSupply: 2 });
  const legacy = await edition(star.id, "Ancienne", { rarity: "RARE", active: false });
  await edition(star.id, "Brouillon", { rarity: "EPIC", active: false });
  await edition(unknown.id, "Standard");
  const own = (editionId: string, ownerId: string) => tx.cardInstance.create({ data: { editionId, ownerId, acquisitionSource: "ADMIN" } });
  await own(standard.id, player.id); await own(standard.id, player.id); await own(legacy.id, player.id); await own(golden.id, other.id);
  for (const editionId of [standard.id, legacy.id]) await tx.cardDiscovery.create({ data: { userId: player.id, editionId } });
  return { player, other, sport, star, unknown, retired, hidden, standard, golden, legacy };
}

describe("Fiche d’un athlète", () => {
  it("débloque biographie, palmarès et statistiques après une découverte et liste les éditions du joueur", async () => isolated(async (tx, client) => {
    const data = await fixture(tx);
    const sheet = await getAthleteSheet(data.player.id, data.star.id, client);
    expect(sheet).toMatchObject({ name: "Étoile encyclopédie", nationality: "France", prestigeScore: 88, unlocked: true, image: null,
      details: { birthDate: "1998-12-20", biography: "Biographie en français.",
        achievements: ["Coupe du monde (2018)", "Ballon d’or"], statistics: ["buts : 300", "sélections : 90"] } });
    expect(sheet.editions.map((edition) => [edition.name, edition.owned, edition.discovered, edition.soldOut, edition.obtainable])).toEqual([
      ["Standard", 2, true, false, true], ["Ancienne", 1, true, false, false], ["Or", 0, false, true, true],
    ]);
    expect(JSON.stringify(sheet)).not.toContain("reviewedById");
  }));

  it("verrouille les détails tant que le joueur n’a découvert aucune édition de l’athlète", async () => isolated(async (tx, client) => {
    const data = await fixture(tx);
    const locked = await getAthleteSheet(data.player.id, data.unknown.id, client);
    expect(locked).toMatchObject({ unlocked: false, details: null });
    expect(JSON.stringify(locked)).not.toContain("Secret");
    const otherView = await getAthleteSheet(data.other.id, data.star.id, client);
    expect(otherView).toMatchObject({ unlocked: false, details: null });
    expect(otherView.editions.map((edition) => [edition.name, edition.owned])).toEqual([["Standard", 0], ["Or", 1]]);
  }));

  it("refuse les athlètes inactifs, les sports inactifs, les identifiants inconnus et les joueurs absents", async () => isolated(async (tx, client) => {
    const data = await fixture(tx);
    for (const id of [data.retired.id, data.hidden.id, "inconnu", "x".repeat(101)])
      await expect(getAthleteSheet(data.player.id, id, client)).rejects.toMatchObject({ code: "ATHLETE_NOT_FOUND", status: 404 });
    await expect(getAthleteSheet("joueur-absent", data.star.id, client)).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
  }));
});

describe("Index de l’encyclopédie", () => {
  it("liste les athlètes jouables avec découverte et éditions possédées, filtrables", async () => isolated(async (tx, client) => {
    const data = await fixture(tx);
    const all = await listEncyclopedia(data.player.id, { sportId: data.sport.id }, client);
    expect(all.athletes.map((athlete) => [athlete.name, athlete.discovered, athlete.ownedEditions, athlete.editions, athlete.prestigeScore])).toEqual([
      ["Étoile encyclopédie", true, 2, 2, 88], ["Inconnu encyclopédie", false, 0, 1, 0],
    ]);
    expect((await listEncyclopedia(data.player.id, { sportId: data.sport.id, discovered: "yes" }, client)).athletes.map((athlete) => athlete.id)).toEqual([data.star.id]);
    expect((await listEncyclopedia(data.player.id, { sportId: data.sport.id, discovered: "no" }, client)).athletes.map((athlete) => athlete.id)).toEqual([data.unknown.id]);
    expect((await listEncyclopedia(data.player.id, { query: "inconnu encyclo" }, client)).athletes.map((athlete) => athlete.id)).toEqual([data.unknown.id]);
    expect((await listEncyclopedia(data.player.id, { query: "Caché encyclopédie" }, client)).total).toBe(0);
    await expect(listEncyclopedia(data.player.id, { ownerId: data.other.id }, client)).rejects.toThrow();
  }));
});
