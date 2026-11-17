import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, type Rarity } from "../../src/generated/prisma/client";
import { sessionCookie } from "./auth-session";

test("événement : achat d’un booster avec des pièces puis ouverture depuis la page des boosters", async ({ page, baseURL }) => {
  const connectionString = process.env.TEST_DATABASE_URL;
  test.skip(!connectionString, "TEST_DATABASE_URL est nécessaire pour tester les événements.");
  test.setTimeout(120_000);
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: connectionString! }) });
  const token = randomUUID();
  const rarities: Rarity[] = ["COMMON", "UNCOMMON", "RARE", "EPIC", "LEGENDARY", "MYTHIC"];
  const weights = [5500, 2500, 1200, 500, 250, 50];
  let userId = "", sportId = "", athleteId = "", eventId = "", createdDiscovery = false;
  try {
    // The boosters page needs the discovery catalogue; it is created only when absent and removed afterwards.
    if (!await prisma.boosterType.findUnique({ where: { id: "discovery-booster" } })) {
      await prisma.boosterType.create({ data: { id: "discovery-booster", slug: `decouverte-${token}`, nameFr: "Découverte de test", category: "MULTISPORT", active: true,
        weights: { create: rarities.map((rarity, index) => ({ rarity, weightBasisPoints: weights[index]! })) } } });
      createdDiscovery = true;
    }
    userId = (await prisma.user.create({ data: { name: `Joueur ${token}`, wallet: { create: { balance: 500 } } } })).id;
    sportId = (await prisma.sport.create({ data: { slug: `event-e2e-${token}`, nameFr: `Discipline ${token}`, providerName: `Fixture ${token}`, active: true } })).id;
    athleteId = (await prisma.athlete.create({ data: { name: `Finaliste ${token}`, sportId } })).id;
    for (const rarity of rarities) await prisma.cardEdition.create({ data: { athleteId, name: `Finale ${rarity}`, rarity, active: true, releaseDate: new Date("2020-01-01T00:00:00Z") } });
    eventId = (await prisma.boosterType.create({ data: { slug: `event-${token}`, nameFr: `Finale ${token}`, category: "EVENT", active: true, price: 120, cardCount: 5, maxPerPlayer: 1,
      startsAt: new Date(Date.now() - 3600_000), endsAt: new Date(Date.now() + 2 * 86400_000),
      weights: { create: rarities.map((rarity, index) => ({ rarity, weightBasisPoints: weights[index]! })) }, sports: { create: { sportId } } } })).id;

    await page.context().addCookies([await sessionCookie(userId, baseURL!)]);
    await page.goto("/boosters");
    const event = page.getByRole("article", { name: `Finale ${token}` });
    await expect(event.getByText(/^Se termine dans/)).toBeVisible();
    const buy = event.getByRole("button", { name: "Acheter (120 pièces)" });
    // Server-rendered button: retry until the client handler is attached and the purchase is recorded.
    await expect(async () => {
      if (!await prisma.walletTransaction.count({ where: { walletId: userId, type: "BOOSTER_PURCHASE" } })) await buy.click({ timeout: 2_000 });
      expect(await prisma.walletTransaction.count({ where: { walletId: userId, type: "BOOSTER_PURCHASE" } })).toBe(1);
    }).toPass({ timeout: 15_000 });
    await expect(event.getByRole("button", { name: "Limite atteinte" })).toBeDisabled();
    await expect(page.getByLabel("Solde : 380 pièces", { exact: true })).toBeVisible();
    await event.getByRole("button", { name: "Ouvrir un booster de l’événement" }).click();
    await expect(event.getByRole("region", { name: `Cartes obtenues : Finale ${token}` }).locator("article")).toHaveCount(5);
    expect(await prisma.cardInstance.count({ where: { ownerId: userId } })).toBe(5);
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  } finally {
    await prisma.$transaction(async (tx) => {
      const editions = athleteId ? (await tx.cardEdition.findMany({ where: { athleteId }, select: { id: true } })).map((row) => row.id) : [];
      await tx.cardInstance.deleteMany({ where: { editionId: { in: editions } } });
      await tx.cardDiscovery.deleteMany({ where: { editionId: { in: editions } } });
      if (eventId) {
        await tx.boosterOpening.deleteMany({ where: { boosterTypeId: eventId } });
        await tx.boosterInventory.deleteMany({ where: { boosterTypeId: eventId } });
        await tx.boosterType.delete({ where: { id: eventId } });
      }
      await tx.cardEdition.deleteMany({ where: { id: { in: editions } } });
      if (athleteId) await tx.athlete.delete({ where: { id: athleteId } });
      if (sportId) await tx.sport.delete({ where: { id: sportId } });
      if (userId) {
        await tx.walletTransaction.deleteMany({ where: { walletId: userId } });
        await tx.wallet.deleteMany({ where: { userId } });
        await tx.boosterInventory.deleteMany({ where: { userId } });
        await tx.passiveBoosterState.deleteMany({ where: { userId } });
        await tx.rateLimitBucket.deleteMany({ where: { key: { contains: userId } } });
        await tx.user.delete({ where: { id: userId } });
      }
      if (createdDiscovery) await tx.boosterType.delete({ where: { id: "discovery-booster" } });
    });
    await prisma.$disconnect();
  }
});
