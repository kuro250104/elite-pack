import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, type Prisma } from "@/generated/prisma/client";
import { collectionFacets, collectionProgress, listCollection } from "@/server/collection/service";
import { afterAll, describe, expect, it } from "vitest";

const connectionString = process.env.TEST_DATABASE_URL;
if (!connectionString) throw new Error("TEST_DATABASE_URL est obligatoire pour les collections.");
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
afterAll(async () => prisma.$disconnect());
async function isolated(test: (tx: Prisma.TransactionClient, client: PrismaClient) => Promise<void>) {
  const rollback = new Error("Annulation volontaire du scénario collection");
  await expect(prisma.$transaction(async (tx) => {
    const client = new Proxy(prisma, { get(target, property) {
      if (property === "$queryRaw") return tx.$queryRaw.bind(tx);
      if (["user", "cardInstance"].includes(String(property))) return Reflect.get(tx, property);
      return Reflect.get(target, property);
    } });
    await test(tx, client);
    throw rollback;
  })).rejects.toBe(rollback);
}
async function fixture(tx: Prisma.TransactionClient) {
  const player = await tx.user.create({ data: {} });
  const otherPlayer = await tx.user.create({ data: {} });
  const sport = await tx.sport.create({ data: { slug: randomUUID(), nameFr: "Sport de test", providerName: "Test" } });
  const athlete = await tx.athlete.create({ data: { name: "Alpha de test", sportId: sport.id, prestigeScore: 10, prestigeOverride: 90 } });
  const otherAthlete = await tx.athlete.create({ data: { name: "Beta de test", sportId: sport.id } });
  const edition = await tx.cardEdition.create({ data: { athleteId: athlete.id, name: "Standard", rarity: "COMMON" } });
  const rareEdition = await tx.cardEdition.create({ data: { athleteId: otherAthlete.id, name: "Argent", rarity: "RARE" } });
  const first = await tx.cardInstance.create({ data: { editionId: edition.id, ownerId: player.id, acquisitionSource: "ADMIN", acquiredAt: new Date("2026-01-01T00:00:00Z") } });
  const second = await tx.cardInstance.create({ data: { editionId: edition.id, ownerId: player.id, acquisitionSource: "ADMIN", acquiredAt: new Date("2026-01-02T00:00:00Z") } });
  const third = await tx.cardInstance.create({ data: { editionId: rareEdition.id, ownerId: player.id, acquisitionSource: "ADMIN", acquiredAt: new Date("2026-01-03T00:00:00Z") } });
  const other = await tx.cardInstance.create({ data: { editionId: edition.id, ownerId: otherPlayer.id, acquisitionSource: "ADMIN" } });
  const retired = await tx.cardInstance.create({ data: { editionId: edition.id, ownerId: null, retiredAt: new Date(), acquisitionSource: "ADMIN" } });
  return { player, otherPlayer, sport, edition, rareEdition, first, second, third, other, retired };
}

describe("Collection personnelle paginée", () => {
  it("isole les propriétaires, masque les cartes retirées et compte les doublons détenus", async () => isolated(async (tx, client) => {
    const data = await fixture(tx);
    const collection = await listCollection(data.player.id, {}, client);
    expect(collection.total).toBe(3);
    expect(collection.cards.map((card) => card.instanceId)).toEqual([data.third.id, data.second.id, data.first.id]);
    expect(collection.duplicates).toEqual({ [data.edition.id]: 2, [data.rareEdition.id]: 1 });
    expect(collection.cards.find((card) => card.instanceId === data.first.id)?.prestigeScore).toBe(90);
    expect(collection.cards.map((card) => card.instanceId)).not.toContain(data.other.id);
    expect(collection.cards.map((card) => card.instanceId)).not.toContain(data.retired.id);
    const other = await listCollection(data.otherPlayer.id, {}, client);
    expect(other.cards.map((card) => card.instanceId)).toEqual([data.other.id]);
    expect(other.duplicates).toEqual({ [data.edition.id]: 1 });
    expect(() => JSON.stringify(collection)).not.toThrow();
    expect(collection.cards[0]).not.toHaveProperty("ownerId");
  }));

  it("pagine les exemplaires sans changer les totaux ni le nombre de doublons", async () => isolated(async (tx, client) => {
    const data = await fixture(tx);
    const pages = [];
    for (let page = 1; page <= 4; page++) pages.push(await listCollection(data.player.id, { page, pageSize: 1 }, client));
    expect(pages.map((page) => page.total)).toEqual([3,3,3,3]);
    expect(pages.map((page) => page.cards.length)).toEqual([1,1,1,0]);
    expect(pages.flatMap((page) => page.cards.map((card) => card.instanceId))).toEqual([data.third.id, data.second.id, data.first.id]);
    expect(pages[1]?.duplicates[data.edition.id]).toBe(2);
    expect(pages[2]?.duplicates[data.edition.id]).toBe(2);
  }));

  it("applique sport, rareté et recherche sans élargir le périmètre du joueur", async () => isolated(async (tx, client) => {
    const data = await fixture(tx);
    const rare = await listCollection(data.player.id, { sportId: data.sport.id, rarity: "RARE", query: "BETA" }, client);
    expect(rare.total).toBe(1);
    expect(rare.cards.map((card) => card.instanceId)).toEqual([data.third.id]);
    expect((await listCollection(data.player.id, { sportId: randomUUID() }, client)).total).toBe(0);
    expect((await listCollection(data.player.id, { query: "ALPHA", sort: "name" }, client)).total).toBe(2);
  }));

  it("refuse un joueur absent et un filtre autoritaire inattendu", async () => isolated(async (_tx, client) => {
    await expect(listCollection("collection-absent-user", {}, client)).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    await expect(listCollection("collection-absent-user", { ownerId: "another-owner" }, client)).rejects.toThrow();
  }));
});

async function catalogue(tx: Prisma.TransactionClient) {
  const player = await tx.user.create({ data: {} });
  const football = await tx.sport.create({ data: { slug: randomUUID(), nameFr: "Football de test", providerName: "Test", active: true } });
  const tennis = await tx.sport.create({ data: { slug: randomUUID(), nameFr: "Tennis de test", providerName: "Test", active: true } });
  const hidden = await tx.sport.create({ data: { slug: randomUUID(), nameFr: "Sport inactif", providerName: "Test" } });
  const star = await tx.athlete.create({ data: { name: "Zeta 100%", sportId: football.id, nationality: "France", currentTeam: "Club A", prestigeScore: 20, prestigeOverride: 95 } });
  const rookie = await tx.athlete.create({ data: { name: "Gamma de test", sportId: football.id, nationality: "Brésil", currentTeam: "Club B", prestigeScore: 60 } });
  const player2 = await tx.athlete.create({ data: { name: "Delta de test", sportId: tennis.id, nationality: "Espagne", prestigeScore: 40 } });
  const ghost = await tx.athlete.create({ data: { name: "Fantôme de test", sportId: hidden.id } });
  const edition = (athleteId: string, name: string, rarity: "COMMON" | "RARE" | "MYTHIC", baseValue: number, active = true) =>
    tx.cardEdition.create({ data: { athleteId, name, rarity, baseValue, active } });
  const starCommon = await edition(star.id, "Standard", "COMMON", 10);
  const starMythic = await edition(star.id, "Mythique", "MYTHIC", 5000);
  const rookieRare = await edition(rookie.id, "Argent", "RARE", 300);
  const tennisCommon = await edition(player2.id, "Standard", "COMMON", 20);
  await edition(player2.id, "Désactivée", "RARE", 999, false);
  await edition(ghost.id, "Standard", "COMMON", 1);
  const own = (editionId: string) => tx.cardInstance.create({ data: { editionId, ownerId: player.id, acquisitionSource: "ADMIN" } });
  await own(starCommon.id); await own(rookieRare.id);
  // Discovered once, then sold to the bank: missing again but no longer locked.
  await tx.cardInstance.create({ data: { editionId: tennisCommon.id, ownerId: null, retiredAt: new Date(), acquisitionSource: "ADMIN" } });
  await tx.cardDiscovery.create({ data: { userId: player.id, editionId: tennisCommon.id } });
  return { player, football, tennis, starCommon, starMythic, rookieRare, tennisCommon };
}

describe("Collection : filtres, tris, cartes manquantes et progression", () => {
  it("filtre par pays et équipe et trie par prestige effectif puis par valeur", async () => isolated(async (tx, client) => {
    const data = await catalogue(tx);
    const france = await listCollection(data.player.id, { country: "France" }, client);
    expect(france.cards.map((card) => card.editionId)).toEqual([data.starCommon.id]);
    expect((await listCollection(data.player.id, { team: "Club B" }, client)).cards.map((card) => card.editionId)).toEqual([data.rookieRare.id]);
    // The administrator override (95) wins over the higher computed score of the other athlete (60).
    expect((await listCollection(data.player.id, { sort: "prestige" }, client)).cards.map((card) => card.editionId))
      .toEqual([data.starCommon.id, data.rookieRare.id]);
    expect((await listCollection(data.player.id, { sort: "value" }, client)).cards.map((card) => card.editionId))
      .toEqual([data.rookieRare.id, data.starCommon.id]);
    expect((await listCollection(data.player.id, { query: "100%" }, client)).total).toBe(1);
    // LIKE wildcards are searched literally: no athlete name contains "_".
    expect((await listCollection(data.player.id, { query: "_" }, client)).total).toBe(0);
    expect(await collectionFacets(data.player.id, client)).toEqual({ countries: ["Brésil", "France"], teams: ["Club A", "Club B"] });
  }));

  it("liste les éditions manquantes obtenables et ne révèle que celles déjà découvertes", async () => isolated(async (tx, client) => {
    const data = await catalogue(tx);
    const football = await listCollection(data.player.id, { status: "missing", sportId: data.football.id }, client);
    expect(football.cards).toEqual([]);
    expect(football.missing.map((card) => card.editionId)).toEqual([data.starMythic.id]);
    expect(football.missing[0]).toMatchObject({ discovered: false, nationality: null, prestigeScore: null, rarity: "MYTHIC" });
    // The inactive edition of the same athlete cannot be obtained and is not listed.
    const tennis = await listCollection(data.player.id, { status: "missing", sportId: data.tennis.id }, client);
    expect(tennis.missing.map((card) => card.editionId)).toEqual([data.tennisCommon.id]);
    expect(tennis.missing[0]).toMatchObject({ discovered: true, nationality: "Espagne", prestigeScore: 40 });
  }));

  it("calcule la progression par sport actif sur les éditions obtenables", async () => isolated(async (tx, client) => {
    const data = await catalogue(tx);
    const progress = await collectionProgress(data.player.id, client);
    const mine = progress.sports.filter((sport) => [data.football.id, data.tennis.id].includes(sport.sportId));
    expect(mine).toEqual([
      { sportId: data.football.id, sport: "Football de test", owned: 2, total: 3 },
      { sportId: data.tennis.id, sport: "Tennis de test", owned: 0, total: 1 },
    ]);
  }));
});
