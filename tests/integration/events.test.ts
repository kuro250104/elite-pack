import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, type Prisma } from "@/generated/prisma/client";
import { createEvent, listEvents, purchaseEventBooster, updateEvent } from "@/server/boosters/events";
import { openBooster } from "@/server/boosters/opening";
import { afterAll, afterEach, describe, expect, it } from "vitest";

const connectionString = process.env.TEST_DATABASE_URL;
if (!connectionString) throw new Error("TEST_DATABASE_URL est obligatoire pour les événements.");
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
afterAll(async () => prisma.$disconnect());

// Purchases and openings commit their own transactions (concurrency is tested), so fixtures are cleaned explicitly.
const created: { users: string[]; sports: string[]; boosters: string[] } = { users: [], sports: [], boosters: [] };
afterEach(async () => {
  await prisma.$transaction(async (tx) => {
    const athletes = (await tx.athlete.findMany({ where: { sportId: { in: created.sports } }, select: { id: true } })).map((row) => row.id);
    const editions = (await tx.cardEdition.findMany({ where: { athleteId: { in: athletes } }, select: { id: true } })).map((row) => row.id);
    await tx.cardInstance.deleteMany({ where: { editionId: { in: editions } } });
    await tx.cardDiscovery.deleteMany({ where: { editionId: { in: editions } } });
    await tx.boosterOpening.deleteMany({ where: { boosterTypeId: { in: created.boosters } } });
    await tx.boosterInventory.deleteMany({ where: { boosterTypeId: { in: created.boosters } } });
    await tx.boosterType.deleteMany({ where: { id: { in: created.boosters } } });
    await tx.cardEdition.deleteMany({ where: { id: { in: editions } } });
    await tx.athlete.deleteMany({ where: { id: { in: athletes } } });
    await tx.sport.deleteMany({ where: { id: { in: created.sports } } });
    await tx.walletTransaction.deleteMany({ where: { walletId: { in: created.users } } });
    await tx.wallet.deleteMany({ where: { userId: { in: created.users } } });
    await tx.passiveBoosterState.deleteMany({ where: { userId: { in: created.users } } });
    await tx.rateLimitBucket.deleteMany({ where: { OR: created.users.map((id) => ({ key: { contains: id } })) } });
    await tx.user.deleteMany({ where: { id: { in: created.users } } });
  });
  created.users = []; created.sports = []; created.boosters = [];
});

const hour = 3600 * 1000;
const weights = [["COMMON", 5500], ["UNCOMMON", 2500], ["RARE", 1200], ["EPIC", 500], ["LEGENDARY", 250], ["MYTHIC", 50]] as const;
async function fixture(options: { price?: number; maxPerPlayer?: number | null; startsAt?: Date; endsAt?: Date; active?: boolean; balance?: number } = {}) {
  const player = await prisma.user.create({ data: { wallet: { create: { balance: options.balance ?? 500 } } } });
  created.users.push(player.id);
  const sport = await prisma.sport.create({ data: { slug: randomUUID(), nameFr: "Sport événement", providerName: `Événement ${randomUUID()}`, active: true } });
  created.sports.push(sport.id);
  const athlete = await prisma.athlete.create({ data: { name: `Star ${randomUUID()}`, sportId: sport.id } });
  const editions = await Promise.all(weights.map(([rarity]) => prisma.cardEdition.create({ data: { athleteId: athlete.id, name: `Événement ${rarity}`, rarity, active: true } })));
  const outside = await prisma.cardEdition.create({ data: { athleteId: athlete.id, name: "Hors événement", rarity: "COMMON", active: true } });
  const event = await prisma.boosterType.create({ data: { slug: randomUUID(), nameFr: "Finale de test", category: "EVENT", active: options.active ?? true,
    price: options.price ?? 100, cardCount: 5, maxPerPlayer: options.maxPerPlayer === undefined ? 2 : options.maxPerPlayer,
    startsAt: options.startsAt ?? new Date(Date.now() - hour), endsAt: options.endsAt ?? new Date(Date.now() + hour),
    weights: { create: weights.map(([rarity, weightBasisPoints]) => ({ rarity, weightBasisPoints })) },
    sports: { create: { sportId: sport.id } }, editions: { create: editions.map((edition) => ({ editionId: edition.id })) } } });
  created.boosters.push(event.id);
  return { player, sport, athlete, editions, outside, event };
}
const balance = async (userId: string) => (await prisma.wallet.findUniqueOrThrow({ where: { userId } })).balance;

describe("Achat de boosters événementiels", () => {
  it("débite, journalise, remplit l’inventaire, rejoue sans second débit et respecte la limite par joueur", async () => {
    const data = await fixture();
    const key = randomUUID();
    expect(await purchaseEventBooster(data.player.id, data.event.id, key, prisma)).toEqual({ boosterTypeId: data.event.id, available: 1, balance: "400", replay: false });
    expect(await purchaseEventBooster(data.player.id, data.event.id, key, prisma)).toMatchObject({ replay: true, available: 1, balance: "400" });
    expect(await prisma.walletTransaction.findMany({ where: { walletId: data.player.id } })).toEqual([expect.objectContaining({ type: "BOOSTER_PURCHASE", amount: BigInt(-100), balanceAfter: BigInt(400), referenceId: data.event.id })]);
    await purchaseEventBooster(data.player.id, data.event.id, randomUUID(), prisma);
    await expect(purchaseEventBooster(data.player.id, data.event.id, randomUUID(), prisma)).rejects.toMatchObject({ code: "EVENT_LIMIT_REACHED" });
    expect(await balance(data.player.id)).toBe(BigInt(300));
    const listed = (await listEvents(data.player.id, prisma)).events.find((event) => event.id === data.event.id);
    expect(listed).toMatchObject({ status: "ongoing", purchased: 2, available: 2, price: "100", maxPerPlayer: 2 });
  });

  it("refuse un solde insuffisant, un événement terminé, à venir, inactif ou qui n’en est pas un, sans débit", async () => {
    const poor = await fixture({ balance: 50 });
    await expect(purchaseEventBooster(poor.player.id, poor.event.id, randomUUID(), prisma)).rejects.toMatchObject({ code: "INSUFFICIENT_FUNDS" });
    const ended = await fixture({ startsAt: new Date(Date.now() - 3 * hour), endsAt: new Date(Date.now() - hour) });
    const upcoming = await fixture({ startsAt: new Date(Date.now() + hour), endsAt: new Date(Date.now() + 3 * hour) });
    const inactive = await fixture({ active: false });
    for (const data of [ended, upcoming, inactive]) await expect(purchaseEventBooster(data.player.id, data.event.id, randomUUID(), prisma)).rejects.toMatchObject({ code: "EVENT_UNAVAILABLE" });
    const plain = await prisma.boosterType.create({ data: { slug: randomUUID(), nameFr: "Booster normal", category: "MULTISPORT", active: true } });
    created.boosters.push(plain.id);
    await expect(purchaseEventBooster(poor.player.id, plain.id, randomUUID(), prisma)).rejects.toMatchObject({ code: "EVENT_UNAVAILABLE" });
    expect(await prisma.walletTransaction.count({ where: { walletId: { in: [poor, ended, upcoming, inactive].map((data) => data.player.id) } } })).toBe(0);
    expect(await balance(poor.player.id)).toBe(BigInt(50));
    // Ended and inactive events are hidden; upcoming ones are announced.
    const visible = (await listEvents(upcoming.player.id, prisma)).events.map((event) => [event.id, event.status]);
    expect(visible).toContainEqual([upcoming.event.id, "upcoming"]);
    expect(visible.map(([id]) => id)).not.toContain(ended.event.id);
    expect(visible.map(([id]) => id)).not.toContain(inactive.event.id);
  });

  it("accepte un événement gratuit, journalisé à 0, et limite les achats simultanés au plafond", async () => {
    const data = await fixture({ price: 0, maxPerPlayer: 2 });
    const outcomes = await Promise.allSettled(Array.from({ length: 4 }, () => purchaseEventBooster(data.player.id, data.event.id, randomUUID(), prisma)));
    expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(2);
    expect(await balance(data.player.id)).toBe(BigInt(500));
    expect((await prisma.boosterInventory.findUniqueOrThrow({ where: { userId_boosterTypeId: { userId: data.player.id, boosterTypeId: data.event.id } } })).quantity).toBe(2);
    expect(await prisma.walletTransaction.count({ where: { walletId: data.player.id, amount: 0, type: "BOOSTER_PURCHASE" } })).toBe(2);
  });
});

describe("Ouverture d’un booster événementiel", () => {
  it("consomme l’inventaire et ne tire que les éditions de l’événement ; refuse le stock gratuit", async () => {
    const data = await fixture();
    await purchaseEventBooster(data.player.id, data.event.id, randomUUID(), prisma);
    const result = await openBooster(data.player.id, { boosterTypeId: data.event.id, source: "inventory", idempotencyKey: randomUUID() }, prisma);
    expect(result.cards).toHaveLength(5);
    expect(new Set(result.cards.map((card) => card.editionId)).has(data.outside.id)).toBe(false);
    expect((await prisma.boosterInventory.findUniqueOrThrow({ where: { userId_boosterTypeId: { userId: data.player.id, boosterTypeId: data.event.id } } })).quantity).toBe(0);
    await expect(openBooster(data.player.id, { boosterTypeId: data.event.id, source: "inventory", idempotencyKey: randomUUID() }, prisma)).rejects.toMatchObject({ code: "BOOSTER_STOCK_EMPTY" });
    await expect(openBooster(data.player.id, { boosterTypeId: data.event.id, source: "passive", idempotencyKey: randomUUID() }, prisma)).rejects.toMatchObject({ code: "PASSIVE_BOOSTER_NOT_ALLOWED" });
  });
});

describe("Administration des événements", () => {
  async function isolated(test: (tx: Prisma.TransactionClient) => Promise<void>) {
    const rollback = new Error("Annulation volontaire");
    await expect(prisma.$transaction(async (tx) => { await test(tx); throw rollback; })).rejects.toBe(rollback);
  }
  it("crée un événement désactivé avec probabilités par défaut et éligibilité, puis le modifie et l’active", async () => isolated(async (tx) => {
    const admin = await tx.user.create({ data: { role: "ADMIN" } });
    const player = await tx.user.create({ data: {} });
    const sport = await tx.sport.create({ data: { slug: randomUUID(), nameFr: "Sport admin événement", providerName: "Admin" } });
    const athlete = await tx.athlete.create({ data: { name: "Athlète admin", sportId: sport.id } });
    const edition = await tx.cardEdition.create({ data: { athleteId: athlete.id, name: "Finale", rarity: "EPIC" } });
    const input = { nameFr: "Finale de la Coupe", startsAt: "2026-12-01T10:00:00+01:00", endsAt: "2026-12-08T10:00:00+01:00", price: 150, cardCount: 3,
      maxPerPlayer: 1, sportIds: [sport.id], editionIds: [edition.id] };
    const { id } = await createEvent(tx, admin.id, input);
    const stored = await tx.boosterType.findUniqueOrThrow({ where: { id }, include: { weights: true, sports: true, editions: true } });
    expect(stored).toMatchObject({ category: "EVENT", active: false, price: BigInt(150), cardCount: 3, maxPerPlayer: 1, startsAt: new Date("2026-12-01T09:00:00Z") });
    expect(stored.weights.reduce((sum, weight) => sum + weight.weightBasisPoints, 0)).toBe(10_000);
    expect([stored.sports.map((row) => row.sportId), stored.editions.map((row) => row.editionId)]).toEqual([[sport.id], [edition.id]]);
    await updateEvent(tx, admin.id, id, { active: true, maxPerPlayer: null, editionIds: [] });
    expect(await tx.boosterType.findUniqueOrThrow({ where: { id }, include: { editions: true } })).toMatchObject({ active: true, maxPerPlayer: null, editions: [] });
    await expect(updateEvent(tx, admin.id, id, { endsAt: "2026-11-30T10:00:00Z" })).rejects.toMatchObject({ code: "INVALID_DATES" });
    await expect(createEvent(tx, admin.id, { ...input, endsAt: "2026-11-30T10:00:00Z" })).rejects.toThrow();
    await expect(createEvent(tx, admin.id, { ...input, sportIds: ["inconnu"] })).rejects.toMatchObject({ code: "INVALID_SPORTS" });
    await expect(createEvent(tx, player.id, input)).rejects.toMatchObject({ status: 403 });
    expect(await tx.adminAuditLog.count({ where: { actorId: admin.id, action: { in: ["EVENT_CREATE", "EVENT_UPDATE"] } } })).toBe(2);
  }));
});
