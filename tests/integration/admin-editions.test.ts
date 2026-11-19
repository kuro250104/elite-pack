import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, type Prisma } from "@/generated/prisma/client";
import { createEdition, listAdminEditions, updateEdition } from "@/server/admin/editions";
import { mintCardInstance } from "@/server/cards/service";
import { afterAll, describe, expect, it } from "vitest";

const connectionString = process.env.TEST_DATABASE_URL;
if (!connectionString) throw new Error("TEST_DATABASE_URL est obligatoire pour les éditions.");
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
afterAll(async () => prisma.$disconnect());
async function isolated(test: (tx: Prisma.TransactionClient) => Promise<void>) {
  const rollback = new Error("Annulation volontaire du scénario éditions");
  await expect(prisma.$transaction(async (tx) => { await test(tx); throw rollback; }, { timeout: 15_000 })).rejects.toBe(rollback);
}
async function fixture(tx: Prisma.TransactionClient) {
  const admin = await tx.user.create({ data: { role: "ADMIN" } });
  const player = await tx.user.create({ data: {} });
  const sport = await tx.sport.create({ data: { slug: randomUUID(), nameFr: "Sport éditions", providerName: `Éditions ${randomUUID()}`, active: true } });
  const otherSport = await tx.sport.create({ data: { slug: randomUUID(), nameFr: "Autre sport", providerName: `Autre ${randomUUID()}`, active: true } });
  const athlete = await tx.athlete.create({ data: { name: `Athlète ${randomUUID()}`, sportId: sport.id, prestigeScore: 50 } });
  const listed = await tx.boosterType.create({ data: { slug: randomUUID(), nameFr: "Booster à liste", category: "SPORT", sports: { create: { sportId: sport.id } } } });
  const elsewhere = await tx.boosterType.create({ data: { slug: randomUUID(), nameFr: "Booster autre sport", category: "SPORT", sports: { create: { sportId: otherSport.id } } } });
  const open = await tx.boosterType.create({ data: { slug: randomUUID(), nameFr: "Booster sans liste", category: "MULTISPORT" } });
  // A booster "lists" its editions once it has at least one BoosterEdition row.
  const seed = await tx.cardEdition.create({ data: { athleteId: athlete.id, name: "Base", rarity: "COMMON" } });
  for (const booster of [listed, elsewhere]) await tx.boosterEdition.create({ data: { boosterTypeId: booster.id, editionId: seed.id } });
  return { admin, player, athlete, listed, elsewhere, open };
}

describe("Création d’éditions", () => {
  it("crée l’édition, calcule sa valeur, l’ajoute aux boosters à liste de son sport et journalise", async () => isolated(async (tx) => {
    const data = await fixture(tx);
    const { id, boosters } = await createEdition(tx, data.admin.id, { athleteId: data.athlete.id, name: "Or", rarity: "LEGENDARY", maxSupply: 100, active: true, releaseDate: "2026-12-01" });
    expect(boosters).toBe(1);
    const legendary = await tx.rarityValue.findUniqueOrThrow({ where: { rarity: "LEGENDARY" } });
    expect(await tx.cardEdition.findUniqueOrThrow({ where: { id } })).toMatchObject({ name: "Or", rarity: "LEGENDARY", maxSupply: 100, active: true,
      baseValue: legendary.baseValue * BigInt(150) / BigInt(100), releaseDate: new Date("2026-12-01T00:00:00Z") });
    expect((await tx.boosterEdition.findMany({ where: { editionId: id } })).map((row) => row.boosterTypeId)).toEqual([data.listed.id]);
    expect(await tx.adminAuditLog.count({ where: { actorId: data.admin.id, action: "EDITION_CREATE", entityId: id } })).toBe(1);
    const unlisted = await createEdition(tx, data.admin.id, { athleteId: data.athlete.id, name: "Hors booster", rarity: "RARE", maxSupply: null, addToBoosters: false });
    expect(await tx.boosterEdition.count({ where: { editionId: unlisted.id } })).toBe(0);
    expect((await tx.cardEdition.findUniqueOrThrow({ where: { id: unlisted.id } })).active).toBe(false);
  }));

  it("refuse les entrées invalides, un athlète inconnu et un non-administrateur", async () => isolated(async (tx) => {
    const data = await fixture(tx);
    const valid = { athleteId: data.athlete.id, name: "Argent", rarity: "RARE", maxSupply: null };
    await expect(createEdition(tx, data.player.id, valid)).rejects.toMatchObject({ status: 403 });
    await expect(createEdition(tx, data.admin.id, { ...valid, athleteId: "inconnu" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    for (const invalid of [{ ...valid, name: " " }, { ...valid, rarity: "LEGEND" }, { ...valid, maxSupply: 0 }, { ...valid, maxSupply: 2.5 },
      { ...valid, releaseDate: "2026-02-30" }, { ...valid, baseValue: 99999 }]) await expect(createEdition(tx, data.admin.id, invalid)).rejects.toThrow();
  }));
});

describe("Modification d’éditions", () => {
  it("modifie librement une édition jamais frappée et revalorise au changement de rareté", async () => isolated(async (tx) => {
    const data = await fixture(tx);
    const { id } = await createEdition(tx, data.admin.id, { athleteId: data.athlete.id, name: "Brouillon", rarity: "COMMON", maxSupply: null });
    expect(await updateEdition(tx, data.admin.id, id, { name: "Mythique", rarity: "MYTHIC", maxSupply: 10, active: true }))
      .toMatchObject({ name: "Mythique", rarity: "MYTHIC", maxSupply: 10, active: true, mintedSupply: 0 });
    const mythic = await tx.rarityValue.findUniqueOrThrow({ where: { rarity: "MYTHIC" } });
    expect((await tx.cardEdition.findUniqueOrThrow({ where: { id } })).baseValue).toBe(mythic.baseValue * BigInt(150) / BigInt(100));
    const audit = await tx.adminAuditLog.findFirstOrThrow({ where: { action: "EDITION_UPDATE", entityId: id } });
    expect(audit).toMatchObject({ before: { name: "Brouillon", rarity: "COMMON", maxSupply: null, active: false }, after: { name: "Mythique", rarity: "MYTHIC", maxSupply: 10, active: true } });
  }));

  it("verrouille rareté et mode de tirage après frappe, et interdit un tirage sous le nombre frappé", async () => isolated(async (tx) => {
    const data = await fixture(tx);
    const limited = await createEdition(tx, data.admin.id, { athleteId: data.athlete.id, name: "Limitée", rarity: "EPIC", maxSupply: 5, active: true });
    const unlimited = await createEdition(tx, data.admin.id, { athleteId: data.athlete.id, name: "Illimitée", rarity: "COMMON", maxSupply: null, active: true });
    for (let index = 0; index < 3; index++) await mintCardInstance(tx, limited.id, data.player.id, undefined, "ADMIN");
    await mintCardInstance(tx, unlimited.id, data.player.id, undefined, "ADMIN");
    await expect(updateEdition(tx, data.admin.id, limited.id, { rarity: "LEGENDARY" })).rejects.toMatchObject({ code: "EDITION_MINTED" });
    await expect(updateEdition(tx, data.admin.id, limited.id, { maxSupply: null })).rejects.toMatchObject({ code: "SUPPLY_MODE_LOCKED" });
    await expect(updateEdition(tx, data.admin.id, unlimited.id, { maxSupply: 100 })).rejects.toMatchObject({ code: "SUPPLY_MODE_LOCKED" });
    await expect(updateEdition(tx, data.admin.id, limited.id, { maxSupply: 2 })).rejects.toMatchObject({ code: "SUPPLY_BELOW_MINTED" });
    // Allowed: same rarity, raising or matching the limit, renaming, deactivating.
    expect(await updateEdition(tx, data.admin.id, limited.id, { rarity: "EPIC", maxSupply: 3, name: "Limitée 3", active: false }))
      .toMatchObject({ maxSupply: 3, name: "Limitée 3", active: false, mintedSupply: 3 });
    await expect(updateEdition(tx, data.admin.id, "inconnue", { active: true })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(updateEdition(tx, data.admin.id, limited.id, {})).rejects.toThrow();
  }));

  it("liste les éditions avec athlète, sport, frappes, valeur et nombre de boosters", async () => isolated(async (tx) => {
    const data = await fixture(tx);
    await createEdition(tx, data.admin.id, { athleteId: data.athlete.id, name: "Or", rarity: "LEGENDARY", maxSupply: 50 });
    const result = await listAdminEditions({ athleteId: data.athlete.id }, tx as unknown as PrismaClient);
    expect(result.total).toBe(2);
    expect(result.editions.map((edition) => [edition.name, edition.rarity, edition.boosters])).toEqual([["Base", "COMMON", 2], ["Or", "LEGENDARY", 1]]);
    expect((await listAdminEditions({ athleteId: data.athlete.id, rarity: "LEGENDARY" }, tx as unknown as PrismaClient)).total).toBe(1);
  }));
});
