import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, type Rarity } from "../../src/generated/prisma/client";
import { sessionCookie } from "./auth-session";

test("booster de bienvenue : cinq cartes frappées par le serveur sont révélées", async ({ page, baseURL }) => {
  const connectionString = process.env.TEST_DATABASE_URL;
  test.skip(!connectionString, "TEST_DATABASE_URL est nécessaire pour tester la boucle réelle.");
  // Full player journey across six pages, compiled on first visit by the dev server.
  test.setTimeout(120_000);
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
      const user = await tx.user.create({ data: { name: `Joueur ${token}`, wallet: { create: {} } } }); userId = user.id;
      const sport = await tx.sport.create({ data: { slug: `game-e2e-${token}`, nameFr: `Discipline ${token}`, providerName: `Fixture ${token}`, active: true } }); sportId = sport.id;
      const athlete = await tx.athlete.create({ data: { name: `Athlète de fixture ${token}`, sportId, nationality: "France", prestigeScore: 50 } }); athleteId = athlete.id;
      await tx.boosterSport.create({ data: { boosterTypeId: "discovery-booster", sportId } });
      for (const rarity of rarities) {
        const edition = await tx.cardEdition.create({ data: { athleteId, name: `Édition ${rarity}`, rarity, active: true, releaseDate: new Date("2020-01-01T00:00:00Z") } });
        editions.push(edition.id);
        await tx.boosterEdition.create({ data: { boosterTypeId: "discovery-booster", editionId: edition.id } });
      }
    });
    // Values come from RarityValue and prestige, exactly as the migration backfill computes them (no forced amount).
    await prisma.$executeRaw`UPDATE "CardEdition" e SET "baseValue" = rv."baseValue" * (100 + LEAST(100, GREATEST(0, COALESCE(a."prestigeOverride", a."prestigeScore")))) / 100
      FROM "Athlete" a, "RarityValue" rv WHERE a.id = e."athleteId" AND rv.rarity = e.rarity AND e."athleteId" = ${athleteId}`;
    await page.context().addCookies([await sessionCookie(userId, baseURL!)]);
    await page.goto("/boosters");
    await page.getByLabel("Choisir un sport", { exact: true }).selectOption(sportId);
    await expect(page.getByRole("button", { name: "Ouvrir un booster gratuit", exact: true })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Ouvrir un booster offert", exact: true })).toBeDisabled();
    await page.getByRole("button", { name: "Récupérer mon booster de bienvenue", exact: true }).click();
    const openButton = page.getByRole("button", { name: "Ouvrir un booster offert", exact: true });
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
    // The five revealed cards appear in the collection, with the sport's progress and the missing editions.
    const owned = new Set((await prisma.cardInstance.findMany({ where: { ownerId: userId }, select: { editionId: true } })).map(card => card.editionId));
    await page.goto(`/collection?sportId=${sportId}`);
    await expect(page.locator("#collection-cards article")).toHaveCount(5);
    await expect(page.getByLabel(`Progression Discipline ${token} : ${Math.floor(owned.size / 6 * 100)} %`)).toBeVisible();
    await page.getByRole("link", { name: "Cartes manquantes", exact: true }).click();
    await expect(page).toHaveURL(/status=missing/);
    await expect(page.locator("#collection-cards article")).toHaveCount(6 - owned.size);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    // The profile reflects the opening; the fixture player has no wallet, so the header shows a zero balance.
    await page.getByRole("link", { name: "Mon profil", exact: true }).click();
    await expect(page.getByRole("heading", { name: `Joueur ${token}`, level: 1 })).toBeVisible();
    const stat = (label: string) => page.locator("div", { has: page.locator("dt", { hasText: new RegExp(`^${label}$`) }) }).locator("dd").first();
    await expect(stat("Cartes possédées")).toHaveText("5");
    await expect(stat("Boosters ouverts")).toHaveText("1");
    await expect(page.getByLabel("Solde : 0 pièce", { exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    // Opening the booster discovered the athlete: the encyclopedia sheet is unlocked and lists owned editions.
    await page.getByRole("link", { name: "Athlètes", exact: true }).click();
    await page.getByLabel("Athlète", { exact: true }).fill(token);
    await page.getByRole("button", { name: "Rechercher", exact: true }).click();
    await page.getByRole("link", { name: new RegExp(`Athlète de fixture ${token}`) }).click();
    await expect(page.getByRole("heading", { name: `Athlète de fixture ${token}`, level: 1 })).toBeVisible();
    await expect(page.getByText("Fiche débloquée", { exact: true })).toBeVisible();
    await expect(page.getByText(`${owned.size} / 6 possédée${owned.size > 1 ? "s" : ""}`, { exact: true })).toBeVisible();
    await expect(page.getByText("Aucune biographie en français n’est disponible pour cet athlète.")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    // The sports page shows the fixture sport with the player's progress (owned editions out of six).
    await page.goto("/sports");
    const sportCard = page.locator("#sports-list li").filter({ hasText: `Discipline ${token}` });
    await expect(sportCard).toContainText("1 athlète · 6 cartes à collectionner");
    await expect(sportCard).toContainText(`${owned.size} / 6`);
    await sportCard.getByRole("link").click();
    await expect(page.getByRole("heading", { name: `Discipline ${token}`, level: 1 })).toBeVisible();
    await expect(page.getByRole("link", { name: new RegExp(`Athlète de fixture ${token}`) })).toBeVisible();
    // The opening history keeps the five cards, linked to their athlete sheet.
    await page.goto("/boosters/historique");
    await expect(page.getByText("1 ouverture.", { exact: false })).toBeVisible();
    await expect(page.locator("ol > li").first().getByRole("link", { name: `Athlète de fixture ${token}` })).toHaveCount(5);
    // Bank resale: the server prices the card (60 % of its computed value), retires it and credits the wallet shown in the header.
    await page.goto(`/collection?sportId=${sportId}`);
    // Target one card: its sell button turns into "Confirmer" / "Annuler" once clicked.
    const sold = page.locator("#collection-cards > div").first();
    const sellButton = sold.getByRole("button", { name: /^Revendre .* à la banque pour .+$/ });
    const label = await sellButton.getAttribute("aria-label");
    const [, cardLabel, price] = label!.match(/^Revendre (.+) à la banque pour (.+)$/)!;
    expect(Number(price!.replace(/\D/gu, ""))).toBeGreaterThan(0);
    const confirmSale = sold.getByRole("button", { name: `Confirmer la revente de ${cardLabel} pour ${price}`, exact: true });
    // The button is server-rendered; retry until the client component has hydrated.
    await expect(async () => {
      if (!await confirmSale.isVisible()) await sellButton.click({ timeout: 2_000 });
      await expect(confirmSale).toBeVisible({ timeout: 1_000 });
    }).toPass({ timeout: 15_000 });
    await confirmSale.click();
    await expect(page.locator("#collection-cards article")).toHaveCount(4);
    await expect(page.getByLabel(`Solde : ${price}`, { exact: true })).toBeVisible();
    expect(await prisma.walletTransaction.count({ where: { walletId: userId, type: "BANK_SALE" } })).toBe(1);
  } finally {
    await prisma.$transaction(async tx => {
      if (userId) {
        await tx.cardDiscovery.deleteMany({ where: { userId } });
        await tx.walletTransaction.deleteMany({ where: { walletId: userId } });
        await tx.wallet.deleteMany({ where: { userId } });
        await tx.cardInstance.deleteMany({ where: { OR: [{ ownerId: userId }, { editionId: { in: editions } }] } });
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
