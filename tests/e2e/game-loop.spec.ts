import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, type Rarity } from "../../src/generated/prisma/client";
import { sessionCookie } from "./auth-session";

test("booster de bienvenue : cinq cartes frappées par le serveur sont révélées", async ({ page, baseURL }) => {
  const connectionString = process.env.TEST_DATABASE_URL;
  test.skip(!connectionString, "TEST_DATABASE_URL est nécessaire pour tester la boucle réelle.");
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: connectionString! }) });
  const token = randomUUID();
  const rarities: Rarity[] = ["COMMON", "UNCOMMON", "RARE", "EPIC", "LEGENDARY", "MYTHIC"];
  const weights = [5500, 2500, 1200, 500, 250, 50];
  let createdBooster = false;
  let userId = "", sportId = "", athleteId = "";
  const editions: string[] = [];
  try {
    await prisma.$transaction(async tx => {
      const existing = await tx.boosterType.findUnique({ where: { id: "discovery-booster" } });
      if (!existing) {
        await tx.boosterType.create({ data: { id: "discovery-booster", slug: "discovery-booster", nameFr: "Découverte de test", category: "MULTISPORT", active: true, cardCount: 5, weights: { create: rarities.map((rarity, index) => ({ rarity, weightBasisPoints: weights[index]! })) } } });
        createdBooster = true;
      } else {
        expect(existing.active).toBe(true);
        expect(existing.cardCount).toBe(5);
      }
      const user = await tx.user.create({ data: { name: `Joueur ${token}` } }); userId = user.id;
      const sport = await tx.sport.create({ data: { slug: `game-e2e-${token}`, nameFr: `Discipline ${token}`, providerName: `Fixture ${token}`, active: true } }); sportId = sport.id;
      const athlete = await tx.athlete.create({ data: { name: `Athlète de fixture ${token}`, sportId, nationality: "France", prestigeScore: 50 } }); athleteId = athlete.id;
      await tx.boosterSport.create({ data: { boosterTypeId: "discovery-booster", sportId } });
      for (const rarity of rarities) {
        const edition = await tx.cardEdition.create({ data: { athleteId, name: `Édition ${rarity}`, rarity, active: true, releaseDate: new Date("2020-01-01T00:00:00Z") } });
        editions.push(edition.id);
        await tx.boosterEdition.create({ data: { boosterTypeId: "discovery-booster", editionId: edition.id } });
      }
    });
    await page.context().addCookies([await sessionCookie(userId, baseURL!)]);
    await page.goto("/boosters");
    await page.getByLabel("Choisir un sport", { exact: true }).selectOption(sportId);
    await expect(page.getByRole("button", { name: "Ouvrir un booster gratuit", exact: true })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Ouvrir mon booster de bienvenue", exact: true })).toBeDisabled();
    await page.getByRole("button", { name: "Récupérer mon booster de bienvenue", exact: true }).click();
    const openButton = page.getByRole("button", { name: "Ouvrir mon booster de bienvenue", exact: true });
    await expect(openButton).toBeEnabled();
    const openingResponse = page.waitForResponse(response => response.url().endsWith("/api/boosters/open") && response.request().method() === "POST");
    await openButton.click();
    const response = await openingResponse;
    expect(response.status()).toBe(200);
    const result = (await response.json()).data;
    expect(result.cards).toHaveLength(5);
    expect(result.source).toBe("welcome");
    await expect(page.getByRole("heading", { name: "Vos nouvelles cartes", exact: true })).toBeVisible();
    await expect(page.locator("article")).toHaveCount(5);
    expect(await prisma.cardInstance.count({ where: { ownerId: userId } })).toBe(5);
    expect(await prisma.boosterOpening.count({ where: { userId } })).toBe(1);
    expect((await prisma.passiveBoosterState.findUniqueOrThrow({ where: { userId } })).stock).toBe(0);
    expect((await prisma.boosterInventory.findUniqueOrThrow({ where: { userId_boosterTypeId: { userId, boosterTypeId: "discovery-booster" } } })).quantity).toBe(0);
    // Relire la même demande ne frappe pas une seconde fois les cinq exemplaires.
    const replay = await page.request.post("/api/boosters/open", { headers: { origin: baseURL!, "Idempotency-Key": response.request().headers()["idempotency-key"]! }, data: response.request().postDataJSON() });
    expect(replay.status()).toBe(200);
    expect((await replay.json()).data.replay).toBe(true);
    expect(await prisma.cardInstance.count({ where: { ownerId: userId } })).toBe(5);
    await expect(page.getByText("Stock plein")).toHaveCount(0);
    await expect(page.getByText(/Prochain booster : (\d{2}:\d{2}|Actualisation…)/)).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  } finally {
    await prisma.$transaction(async tx => {
      if (userId) {
        await tx.cardDiscovery.deleteMany({ where: { userId } });
        await tx.cardInstance.deleteMany({ where: { ownerId: userId } });
        await tx.boosterOpening.deleteMany({ where: { userId } });
        await tx.boosterInventory.deleteMany({ where: { userId } });
        await tx.passiveBoosterState.deleteMany({ where: { userId } });
        await tx.rateLimitBucket.deleteMany({ where: { key: { contains: userId } } });
        await tx.user.deleteMany({ where: { id: userId } });
      }
      await tx.boosterEdition.deleteMany({ where: { editionId: { in: editions } } });
      await tx.cardEdition.deleteMany({ where: { id: { in: editions } } });
      if (sportId) await tx.boosterSport.deleteMany({ where: { sportId } });
      if (athleteId) await tx.athlete.deleteMany({ where: { id: athleteId } });
      if (sportId) await tx.sport.deleteMany({ where: { id: sportId } });
      if (createdBooster) await tx.boosterType.delete({ where: { id: "discovery-booster" } });
    });
    await prisma.$disconnect();
  }
});
