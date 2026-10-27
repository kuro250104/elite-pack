import { createHash, randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, type Prisma } from "@/generated/prisma/client";
import { authenticateCredentials, registerPlayer } from "@/server/auth/service";
import { afterAll, describe, expect, it } from "vitest";

const connectionString = process.env.TEST_DATABASE_URL;
if (!connectionString) throw new Error("TEST_DATABASE_URL est obligatoire pour les comptes email.");
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
afterAll(async () => prisma.$disconnect());
const payload = () => ({ name: "Joueur de test", email: `credentials-${randomUUID()}@example.com`,
  password: " mot de passe de test ", passwordConfirmation: " mot de passe de test " });

// Savepoints reproduce service-owned transactions inside a scenario that rolls back entirely.
function clientWithin(tx: Prisma.TransactionClient): PrismaClient {
  let sequence = 0;
  return new Proxy(prisma, {
    get(target, property) {
      if (property === "user") return tx.user;
      if (property === "$transaction") return async <T>(operation: (transaction: Prisma.TransactionClient) => Promise<T>) => {
        const savepoint = `credentials_${sequence++}`;
        await tx.$executeRawUnsafe(`SAVEPOINT ${savepoint}`);
        try {
          const result = await operation(tx);
          await tx.$executeRawUnsafe(`RELEASE SAVEPOINT ${savepoint}`);
          return result;
        } catch (error) {
          await tx.$executeRawUnsafe(`ROLLBACK TO SAVEPOINT ${savepoint}`);
          await tx.$executeRawUnsafe(`RELEASE SAVEPOINT ${savepoint}`);
          throw error;
        }
      };
      return Reflect.get(target, property);
    },
  });
}
async function isolated(test: (tx: Prisma.TransactionClient, client: PrismaClient) => Promise<void>) {
  const rollback = new Error("Annulation volontaire du scénario email");
  await expect(prisma.$transaction(async (tx) => { await test(tx, clientWithin(tx)); throw rollback; },
    { timeout: 15000 })).rejects.toBe(rollback);
}

describe("Comptes email transactionnels", () => {
  it("crée atomiquement un joueur, un portefeuille, un journal et le stock à zéro", async () => isolated(async (tx, client) => {
    const input = payload();
    const user = await registerPlayer({ ...input, email: input.email.toUpperCase() }, client);
    expect(user).toMatchObject({ email: input.email, role: "PLAYER" });
    expect(user).not.toHaveProperty("passwordHash");
    const config = await tx.gameConfiguration.findUniqueOrThrow({ where: { id: "default" } });
    const wallet = await tx.wallet.findUniqueOrThrow({ where: { userId: user.id }, include: { transactions: true } });
    expect(wallet.balance).toBe(config.startingBalance);
    expect(wallet.transactions).toHaveLength(1);
    expect(wallet.transactions[0]).toMatchObject({ type: "INITIAL_BALANCE", amount: config.startingBalance, idempotencyKey: "initial-balance" });
    expect(await tx.passiveBoosterState.findUniqueOrThrow({ where: { userId: user.id } })).toMatchObject({ stock: 0 });
    expect((await tx.user.findUniqueOrThrow({ where: { id: user.id } })).passwordHash).toMatch(/^scrypt\$/u);
    await expect(registerPlayer(input, client)).rejects.toMatchObject({ code: "REGISTRATION_UNAVAILABLE" });
    expect(await tx.user.count({ where: { email: input.email } })).toBe(1);
    expect(await tx.wallet.count({ where: { userId: user.id } })).toBe(1);
  }));

  it("annule toutes les données du joueur si la transaction de création échoue", async () => isolated(async (tx, client) => {
    const input = payload();
    const failure = new Error("Échec volontaire avant validation de la création");
    let transactions = 0;
    const failingClient = new Proxy(client, {
      get(target, property) {
        if (property === "$transaction") return async <T>(operation: (transaction: Prisma.TransactionClient) => Promise<T>) => {
          transactions++;
          return target.$transaction(async (transaction) => {
            const result = await operation(transaction);
            if (transactions === 2) throw failure;
            return result;
          });
        };
        return Reflect.get(target, property);
      },
    });
    await expect(registerPlayer(input, failingClient)).rejects.toBe(failure);
    expect(await tx.user.findUnique({ where: { email: input.email } })).toBeNull();
    expect(await tx.wallet.count({ where: { user: { email: input.email } } })).toBe(0);
    expect(await tx.walletTransaction.count({ where: { wallet: { user: { email: input.email } } } })).toBe(0);
    expect(await tx.passiveBoosterState.count({ where: { user: { email: input.email } } })).toBe(0);
  }));

  it("authentifie sans exposer de secret et refuse mauvais mot de passe, inconnu et compte OAuth", async () => isolated(async (tx, client) => {
    const input = payload();
    const user = await registerPlayer(input, client);
    expect(await authenticateCredentials({ email: input.email.toUpperCase(), password: input.password }, client)).toEqual(user);
    expect(await authenticateCredentials({ email: input.email, password: "mot de passe incorrect" }, client)).toBeNull();
    expect(await authenticateCredentials({ email: payload().email, password: input.password }, client)).toBeNull();
    const oauth = await tx.user.create({ data: { email: payload().email } });
    expect(await authenticateCredentials({ email: oauth.email, password: input.password }, client)).toBeNull();
    expect(await tx.adminAuditLog.count({ where: { actorId: user.id } })).toBe(0);
  }));

  it("refuse les entrées invalides et l’injection de rôle sans créer de compte", async () => isolated(async (tx, client) => {
    const input = payload();
    await expect(registerPlayer({ ...input, role: "ADMIN" }, client)).rejects.toMatchObject({ code: "INVALID_REGISTRATION" });
    expect(await authenticateCredentials({ email: input.email, password: input.password, role: "ADMIN" }, client)).toBeNull();
    expect(await tx.user.findUnique({ where: { email: input.email } })).toBeNull();
  }));

  it("respecte les plafonds globaux de création et connexion", async () => isolated(async (tx, client) => {
    const input = payload();
    await tx.$executeRaw`INSERT INTO "RateLimitBucket" ("key","windowStart","count")
      VALUES ('auth:register:global',clock_timestamp(),10)
      ON CONFLICT ("key") DO UPDATE SET "windowStart"=clock_timestamp(), "count"=10, "nextAllowedAt"=NULL`;
    await expect(registerPlayer(input, client)).rejects.toMatchObject({ status: 429 });
    await tx.$executeRaw`INSERT INTO "RateLimitBucket" ("key","windowStart","count")
      VALUES ('auth:login:global',clock_timestamp(),60)
      ON CONFLICT ("key") DO UPDATE SET "windowStart"=clock_timestamp(), "count"=60, "nextAllowedAt"=NULL`;
    await expect(authenticateCredentials({ email: input.email, password: input.password }, client)).rejects.toMatchObject({ status: 429 });
    expect(await tx.user.findUnique({ where: { email: input.email } })).toBeNull();
  }));

  it("limite les inscriptions à trois tentatives par email et heure", async () => isolated(async (tx, client) => {
    const input = payload();
    await registerPlayer(input, client);
    await expect(registerPlayer(input, client)).rejects.toMatchObject({ code: "REGISTRATION_UNAVAILABLE" });
    await expect(registerPlayer(input, client)).rejects.toMatchObject({ code: "REGISTRATION_UNAVAILABLE" });
    await expect(registerPlayer(input, client)).rejects.toMatchObject({ status: 429 });
    const digest = createHash("sha256").update(input.email).digest("hex");
    expect((await tx.rateLimitBucket.findUniqueOrThrow({ where: { key: `auth:register:email:${digest}` } })).count).toBe(3);
    expect(await tx.user.count({ where: { email: input.email } })).toBe(1);
  }));

  it("limite les tentatives par email normalisé avant le hachage", async () => isolated(async (tx, client) => {
    const input = payload();
    const digest = createHash("sha256").update(input.email).digest("hex");
    for (let attempt = 0; attempt < 5; attempt++) {
      expect(await authenticateCredentials({ email: input.email.toUpperCase(), password: input.password }, client)).toBeNull();
    }
    await expect(authenticateCredentials({ email: input.email, password: input.password }, client)).rejects.toMatchObject({ status: 429 });
    const bucket = await tx.rateLimitBucket.findUniqueOrThrow({ where: { key: `auth:login:email:${digest}` } });
    expect(bucket.count).toBe(5);
    expect(bucket.key).not.toContain(input.email);
  }));
});
