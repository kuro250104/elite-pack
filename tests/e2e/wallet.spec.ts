import { PrismaPg } from "@prisma/adapter-pg";
import { expect, test } from "@playwright/test";
import { PrismaClient } from "../../src/generated/prisma/client";
import { sessionCookie } from "./auth-session";

for (const viewport of [{ width: 390, height: 844 }, { width: 800, height: 600 }]) {
  test(`consulte et filtre le portefeuille en ${viewport.width}×${viewport.height}`, async ({ page, baseURL }) => {
    const connectionString = process.env.TEST_DATABASE_URL;
    test.skip(!connectionString, "TEST_DATABASE_URL est requis pour le portefeuille.");
    const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
    let userId: string | undefined;
    try {
      const player = await prisma.user.create({ data: {
        name: "Joueur portefeuille de test",
        wallet: { create: { balance: 1000n, lifetimeEarnings: 1000n, transactions: { create: {
          type: "INITIAL_BALANCE", amount: 1000n, balanceAfter: 1000n, idempotencyKey: "initial-e2e",
        } } } },
      } });
      userId = player.id;
      await page.setViewportSize(viewport);
      await page.goto("/profil/portefeuille");
      await expect(page).toHaveURL(/\/connexion(?:[?].*)?$/);
      await page.context().addCookies([await sessionCookie(player.id, baseURL!)]);
      await page.goto("/profil");
      await page.getByRole("link", { name: "Voir mon portefeuille" }).click();
      await expect(page.getByRole("heading", { name: "Mon portefeuille" })).toBeVisible();
      await expect(page.getByText("Solde de départ", { exact: true }).filter({ visible: true })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      await page.getByLabel("Type", { exact: true }).selectOption("REWARD");
      await page.getByRole("button", { name: "Filtrer" }).click();
      await expect(page.getByText("Aucune transaction pour cette sélection.")).toBeVisible();
      await expect(page.getByLabel("Type", { exact: true })).toHaveValue("REWARD");
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    } finally {
      try {
        if (userId) await prisma.$transaction([
          prisma.rateLimitBucket.deleteMany({ where: { key: { endsWith: `:${userId}` } } }),
          prisma.passiveBoosterState.deleteMany({ where: { userId } }),
          prisma.walletTransaction.deleteMany({ where: { walletId: userId } }),
          prisma.wallet.deleteMany({ where: { userId } }),
          prisma.user.deleteMany({ where: { id: userId } }),
        ]);
      } finally {
        await prisma.$disconnect();
      }
    }
  });
}
