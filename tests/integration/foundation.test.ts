import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const connectionString = process.env.TEST_DATABASE_URL;
if (!connectionString) {
  throw new Error("TEST_DATABASE_URL est obligatoire : utilisez une base PostgreSQL de test migrée.");
}

let client: Client;
let transactionStarted = false;
let userId: string;
let editionId: string;
let cardId: string;

beforeEach(async () => {
  transactionStarted = false;
  client = new Client({ connectionString });
  await client.connect();
  await client.query("BEGIN");
  transactionStarted = true;
  userId = randomUUID();
  editionId = randomUUID();
  cardId = randomUUID();
  const sportId = randomUUID();
  const athleteId = randomUUID();
  await client.query('INSERT INTO "User" (id, "updatedAt") VALUES ($1, now())', [userId]);
  await client.query('INSERT INTO "Sport" (id, slug, "nameFr", "providerName", "updatedAt") VALUES ($1,$1,\'Test\',\'Test\',now())', [sportId]);
  await client.query('INSERT INTO "Athlete" (id,name,"sportId","updatedAt") VALUES ($1,\'Athlète de test\',$2,now())', [athleteId, sportId]);
  await client.query('INSERT INTO "CardEdition" (id,"athleteId",name,rarity,"updatedAt") VALUES ($1,$2,\'Standard\',\'COMMON\',now())', [editionId, athleteId]);
  await client.query('INSERT INTO "CardInstance" (id,"editionId","ownerId","acquisitionSource") VALUES ($1,$2,$3,\'ADMIN\')', [cardId, editionId, userId]);
});

afterEach(async () => {
  if (client) {
    try {
      if (transactionStarted) await client.query("ROLLBACK");
    } finally {
      await client.end();
    }
  }
});

async function listing(price = 100) {
  const id = randomUUID();
  await client.query('INSERT INTO "MarketplaceListing" (id,"cardInstanceId","sellerId",price) VALUES ($1,$2,$3,$4)', [id, cardId, userId, price]);
  return id;
}

describe("Invariants PostgreSQL de la fondation", () => {
  it("autorise plusieurs exemplaires d'une édition pour le même joueur", async () => {
    await client.query('INSERT INTO "CardInstance" (id,"editionId","ownerId","acquisitionSource") VALUES ($1,$2,$3,\'ADMIN\')', [randomUUID(), editionId, userId]);
    const result = await client.query('SELECT count(*)::int AS count FROM "CardInstance" WHERE "editionId"=$1 AND "ownerId"=$2', [editionId, userId]);
    expect(result.rows[0].count).toBe(2);
  });

  it("rejette un propriétaire inexistant", async () => {
    await expect(client.query('UPDATE "CardInstance" SET "ownerId"=$1 WHERE id=$2', [randomUUID(), cardId])).rejects.toMatchObject({ code: "23503" });
  });

  it("rejette un exemplaire retiré encore détenu", async () => {
    await expect(client.query('UPDATE "CardInstance" SET "retiredAt"=now() WHERE id=$1', [cardId])).rejects.toMatchObject({ code: "23514" });
  });

  it("protège la découverte lorsque la carte est retirée", async () => {
    await client.query('INSERT INTO "CardDiscovery" ("userId","editionId") VALUES ($1,$2)', [userId, editionId]);
    await client.query('UPDATE "CardInstance" SET "ownerId"=NULL,"retiredAt"=now() WHERE id=$1', [cardId]);
    const result = await client.query('SELECT count(*)::int AS count FROM "CardDiscovery" WHERE "userId"=$1 AND "editionId"=$2', [userId, editionId]);
    expect(result.rows[0].count).toBe(1);
  });

  it("rejette un dépassement du compteur de tirage limité", async () => {
    await expect(client.query('UPDATE "CardEdition" SET "maxSupply"=1,"mintedSupply"=2 WHERE id=$1', [editionId])).rejects.toMatchObject({ code: "23514" });
  });

  it("autorise un compteur de tirage illimité", async () => {
    await client.query('UPDATE "CardEdition" SET "mintedSupply"=100000 WHERE id=$1', [editionId]);
    const result = await client.query('SELECT "mintedSupply","maxSupply" FROM "CardEdition" WHERE id=$1', [editionId]);
    expect(result.rows[0]).toMatchObject({ mintedSupply: 100000, maxSupply: null });
  });

  it("rejette un solde négatif", async () => {
    await expect(client.query('INSERT INTO "Wallet" ("userId",balance,"updatedAt") VALUES ($1,-1,now())', [userId])).rejects.toMatchObject({ code: "23514" });
  });

  it("conserve les grands montants sans perte de précision", async () => {
    const amount = "9007199254740993";
    await client.query('INSERT INTO "Wallet" ("userId",balance,"updatedAt") VALUES ($1,$2,now())', [userId, amount]);
    const result = await client.query('SELECT balance FROM "Wallet" WHERE "userId"=$1', [userId]);
    expect(result.rows[0].balance).toBe(amount);
  });

  it("interdit une écriture répétée avec la même clé d'idempotence", async () => {
    await client.query('INSERT INTO "Wallet" ("userId","updatedAt") VALUES ($1,now())', [userId]);
    const insert = 'INSERT INTO "WalletTransaction" (id,"walletId",type,amount,"balanceAfter","idempotencyKey") VALUES ($1,$2,\'REWARD\',10,10,\'test-reward\')';
    await client.query(insert, [randomUUID(), userId]);
    await expect(client.query(insert, [randomUUID(), userId])).rejects.toMatchObject({ code: "23505" });
  });

  it("initialise le stock passif à zéro", async () => {
    await client.query('INSERT INTO "PassiveBoosterState" ("userId","nextGenerationAt","updatedAt") VALUES ($1,now()+interval \'15 minutes\',now())', [userId]);
    const result = await client.query('SELECT stock FROM "PassiveBoosterState" WHERE "userId"=$1', [userId]);
    expect(result.rows[0].stock).toBe(0);
  });

  it("rejette un stock passif supérieur à dix", async () => {
    await expect(client.query('INSERT INTO "PassiveBoosterState" ("userId",stock,"updatedAt") VALUES ($1,11,now())', [userId])).rejects.toMatchObject({ code: "23514" });
  });

  it("rejette une échéance de génération à stock plein", async () => {
    await expect(client.query('INSERT INTO "PassiveBoosterState" ("userId",stock,"nextGenerationAt","updatedAt") VALUES ($1,10,now(),now())', [userId])).rejects.toMatchObject({ code: "23514" });
  });

  it("interdit plusieurs annonces actives pour un exemplaire", async () => {
    await listing();
    await expect(listing()).rejects.toMatchObject({ code: "23505" });
  });

  it("autorise une nouvelle annonce après annulation", async () => {
    const previous = await listing();
    await client.query('UPDATE "MarketplaceListing" SET status=\'CANCELLED\',"closedAt"=now() WHERE id=$1', [previous]);
    await listing();
    const result = await client.query('SELECT count(*)::int AS count FROM "MarketplaceListing" WHERE "cardInstanceId"=$1 AND status=\'ACTIVE\'', [cardId]);
    expect(result.rows[0].count).toBe(1);
  });

  it("interdit au vendeur d'être l'acheteur", async () => {
    const id = await listing();
    await expect(client.query('UPDATE "MarketplaceListing" SET status=\'SOLD\',"buyerId"=$1,"closedAt"=now() WHERE id=$2', [userId, id])).rejects.toMatchObject({ code: "23514" });
  });

  it("rejette un prix de vente nul", async () => {
    await expect(listing(0)).rejects.toMatchObject({ code: "23514" });
  });
});
