import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../src/generated/prisma/client";
import { sessionCookie } from "./auth-session";

// Client buttons are server-rendered first; retry the click until hydration makes it effective.
async function clickUntil(page: Page, action: () => Promise<void>, ready: () => Promise<void>) {
  await expect(async () => { await action(); await ready(); }).toPass({ timeout: 15_000 });
}

test("marché : un joueur met en vente depuis sa collection, un autre achète", async ({ browser, baseURL }) => {
  const connectionString = process.env.TEST_DATABASE_URL;
  test.skip(!connectionString, "TEST_DATABASE_URL est nécessaire pour tester le marché réel.");
  test.setTimeout(120_000);
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: connectionString! }) });
  const token = randomUUID();
  let sellerId = "", buyerId = "", sportId = "", athleteId = "", editionId = "";
  try {
    const seller = await prisma.user.create({ data: { name: `Vendeur ${token}`, wallet: { create: {} } } }); sellerId = seller.id;
    const buyer = await prisma.user.create({ data: { name: `Acheteur ${token}`, wallet: { create: { balance: 500, lifetimeEarnings: 500 } } } }); buyerId = buyer.id;
    sportId = (await prisma.sport.create({ data: { slug: `market-e2e-${token}`, nameFr: `Discipline ${token}`, providerName: `Fixture ${token}`, active: true } })).id;
    athleteId = (await prisma.athlete.create({ data: { name: `Star ${token}`, sportId } })).id;
    editionId = (await prisma.cardEdition.create({ data: { athleteId, name: "Or", rarity: "LEGENDARY", baseValue: 600, active: true } })).id;
    await prisma.cardInstance.create({ data: { editionId, ownerId: sellerId, acquisitionSource: "BOOSTER" } });

    const sellerPage = await (await browser.newContext()).newPage();
    await sellerPage.context().addCookies([await sessionCookie(sellerId, baseURL!)]);
    await sellerPage.goto(`/collection?sportId=${sportId}`);
    const priceInput = sellerPage.getByLabel("Prix en pièces", { exact: true });
    await clickUntil(sellerPage, async () => { if (!await priceInput.isVisible()) await sellerPage.getByRole("button", { name: /^Mettre Star .* en vente sur le marché$/ }).click({ timeout: 2_000 }); },
      () => expect(priceInput).toBeVisible({ timeout: 1_000 }));
    await expect(priceInput).toHaveValue("600");
    await priceInput.fill("350");
    await sellerPage.getByRole("button", { name: "Valider", exact: true }).click();
    await expect(sellerPage.getByText("En vente sur le marché : 350 pièces", { exact: true })).toBeVisible();
    // A listed card cannot be sold to the bank from the collection.
    await expect(sellerPage.getByRole("button", { name: /à la banque/ })).toHaveCount(0);

    const buyerPage = await (await browser.newContext()).newPage();
    await buyerPage.context().addCookies([await sessionCookie(buyerId, baseURL!)]);
    await buyerPage.goto(`/marche?sportId=${sportId}`);
    await expect(buyerPage.getByText(`Vendue par Vendeur ${token} · Valeur 600 pièces`)).toBeVisible();
    const confirm = buyerPage.getByRole("button", { name: /^Confirmer l’achat de Star .* pour 350 pièces$/ });
    await clickUntil(buyerPage, async () => { if (!await confirm.isVisible()) await buyerPage.getByRole("button", { name: /^Acheter Star .* pour 350 pièces$/ }).click({ timeout: 2_000 }); },
      () => expect(confirm).toBeVisible({ timeout: 1_000 }));
    await confirm.click();
    await expect(buyerPage.getByLabel("Solde : 150 pièces", { exact: true })).toBeVisible();
    await expect(buyerPage.locator("#market-listings article")).toHaveCount(0);
    await buyerPage.getByRole("link", { name: "Historique", exact: true }).click();
    await expect(buyerPage.getByText(/^Achat/)).toBeVisible();
    await buyerPage.goto(`/collection?sportId=${sportId}`);
    await expect(buyerPage.locator("#collection-cards article")).toHaveCount(1);
    expect(await buyerPage.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

    await sellerPage.reload();
    await expect(sellerPage.getByLabel("Solde : 350 pièces", { exact: true })).toBeVisible();
    await expect(sellerPage.locator("#collection-cards article")).toHaveCount(0);
  } finally {
    await prisma.$transaction(async (tx) => {
      const users = [sellerId, buyerId].filter(Boolean);
      if (editionId) {
        await tx.marketplaceListing.deleteMany({ where: { card: { editionId } } });
        await tx.cardInstance.deleteMany({ where: { editionId } });
        await tx.cardDiscovery.deleteMany({ where: { editionId } });
        await tx.cardEdition.deleteMany({ where: { id: editionId } });
      }
      if (athleteId) await tx.athlete.deleteMany({ where: { id: athleteId } });
      if (sportId) await tx.sport.deleteMany({ where: { id: sportId } });
      await tx.walletTransaction.deleteMany({ where: { walletId: { in: users } } });
      await tx.wallet.deleteMany({ where: { userId: { in: users } } });
      await tx.passiveBoosterState.deleteMany({ where: { userId: { in: users } } });
      await tx.rateLimitBucket.deleteMany({ where: { OR: users.map((id) => ({ key: { contains: id } })) } });
      await tx.user.deleteMany({ where: { id: { in: users } } });
    });
    await prisma.$disconnect();
  }
});
