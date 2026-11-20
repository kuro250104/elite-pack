import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { expect, test } from "@playwright/test";
import { PrismaClient } from "../../src/generated/prisma/client";
import { sessionCookie } from "./auth-session";

for (const viewport of [{ width: 390, height: 844 }, { width: 800, height: 600 }]) {
  test(`ajoute et retire un souhait en ${viewport.width}×${viewport.height}`, async ({ page, baseURL }) => {
    const connectionString = process.env.TEST_DATABASE_URL;
    test.skip(!connectionString, "TEST_DATABASE_URL est requis pour tester les listes de souhaits.");
    const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
    const athleteName = `Athlète souhait ${randomUUID()}`;
    const data = await prisma.$transaction(async (tx) => {
      const player = await tx.user.create({ data: {} });
      const sport = await tx.sport.create({ data: { slug: randomUUID(), nameFr: "Sport de test", providerName: "Test", active: true } });
      const athlete = await tx.athlete.create({ data: { sportId: sport.id, name: athleteName } });
      await tx.cardEdition.create({ data: { athleteId: athlete.id, rarity: "RARE", name: "Édition souhaitée", active: true } });
      return { player, sport, athlete };
    });
    try {
      await page.setViewportSize(viewport);
      await page.context().addCookies([await sessionCookie(data.player.id, baseURL!)]);
      await page.goto(`/athletes/${data.athlete.id}`);
      const noOverflow = () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
      expect(await noOverflow()).toBe(true);
      const add = page.getByRole("button", { name: "Ajouter à ma liste de souhaits" });
      const remove = page.getByRole("button", { name: "Retirer de ma liste de souhaits" });
      await expect(async () => {
        if (await add.isVisible()) await add.click({ timeout: 2_000 });
        await expect(remove).toHaveAttribute("aria-pressed", "true", { timeout: 1_000 });
      }).toPass({ timeout: 15_000 });
      await page.goto("/collection");
      await page.getByRole("link", { name: "Liste de souhaits", exact: true }).click();
      await expect(page).toHaveURL(/\/collection\/souhaits$/);
      await expect(page.getByRole("heading", { name: athleteName })).toBeVisible();
      expect(await noOverflow()).toBe(true);
      await remove.click();
      await expect(page.getByText("Votre liste de souhaits est vide.", { exact: false })).toBeVisible();
      await expect(page.getByRole("heading", { name: athleteName })).toHaveCount(0);
    } finally {
      try {
        await prisma.$transaction(async (tx) => {
          await tx.rateLimitBucket.deleteMany({ where: { key: { endsWith: `:${data.player.id}` } } });
          await tx.user.delete({ where: { id: data.player.id } });
          await tx.cardEdition.deleteMany({ where: { athleteId: data.athlete.id } });
          await tx.athlete.delete({ where: { id: data.athlete.id } });
          await tx.sport.delete({ where: { id: data.sport.id } });
        });
      } finally {
        await prisma.$disconnect();
      }
    }
  });
}
