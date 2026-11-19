import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, type Prisma } from "@/generated/prisma/client";
import { getSportDetail, listSportsCatalogue } from "@/server/sports/catalogue";
import { afterAll, describe, expect, it } from "vitest";

const connectionString = process.env.TEST_DATABASE_URL;
if (!connectionString) throw new Error("TEST_DATABASE_URL est obligatoire pour le catalogue des sports.");
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
afterAll(async () => prisma.$disconnect());
async function isolated(test: (tx: Prisma.TransactionClient, client: PrismaClient) => Promise<void>) {
  const rollback = new Error("Annulation volontaire du scénario sports");
  await expect(prisma.$transaction(async (tx) => { await test(tx, tx as unknown as PrismaClient); throw rollback; })).rejects.toBe(rollback);
}

describe("Catalogue des sports", () => {
  it("compte athlètes, cartes obtenables, cartes possédées et frappées des seuls sports actifs", async () => isolated(async (tx, client) => {
    const player = await tx.user.create({ data: {} });
    const other = await tx.user.create({ data: {} });
    const sport = await tx.sport.create({ data: { slug: randomUUID(), nameFr: `Équitation ${randomUUID()}`, providerName: "E", active: true, icon: "medal" } });
    const hidden = await tx.sport.create({ data: { slug: randomUUID(), nameFr: `Caché ${randomUUID()}`, providerName: "C" } });
    const star = await tx.athlete.create({ data: { name: "Zoé Étoile", sportId: sport.id, prestigeScore: 30, prestigeOverride: 95 } });
    const rookie = await tx.athlete.create({ data: { name: "Ana Débutante", sportId: sport.id, prestigeScore: 60 } });
    await tx.athlete.create({ data: { name: "Retraité", sportId: sport.id, active: false, prestigeScore: 100 } });
    const edition = (athleteId: string, active = true, mintedSupply = 0) => tx.cardEdition.create({ data: { athleteId, name: "É", rarity: "COMMON", active, mintedSupply } });
    const owned = await edition(star.id, true, 3);
    await edition(star.id); await edition(rookie.id, true, 1); await edition(rookie.id, false);
    await tx.cardInstance.create({ data: { editionId: owned.id, ownerId: player.id, acquisitionSource: "ADMIN" } });
    await tx.cardInstance.create({ data: { editionId: owned.id, ownerId: player.id, acquisitionSource: "ADMIN" } });
    await tx.cardInstance.create({ data: { editionId: owned.id, ownerId: other.id, acquisitionSource: "ADMIN" } });

    const catalogue = await listSportsCatalogue(player.id, client);
    expect(catalogue.find((row) => row.id === sport.id)).toEqual({ id: sport.id, slug: sport.slug, nameFr: sport.nameFr, category: null, icon: "medal",
      athletes: 2, editions: 3, owned: 1, minted: 4 });
    expect(catalogue.map((row) => row.id)).not.toContain(hidden.id);
    const detail = await getSportDetail(player.id, sport.id, client);
    expect(detail.topAthletes.map((athlete) => [athlete.name, athlete.prestige])).toEqual([["Zoé Étoile", 95], ["Ana Débutante", 60]]);
    expect((await getSportDetail(other.id, sport.id, client)).owned).toBe(1);
    for (const id of [hidden.id, "inconnu", "x".repeat(101)]) await expect(getSportDetail(player.id, id, client)).rejects.toMatchObject({ code: "SPORT_NOT_FOUND", status: 404 });
  }));
});
