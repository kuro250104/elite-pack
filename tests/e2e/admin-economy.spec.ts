import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../src/generated/prisma/client";
import { sessionCookie } from "./auth-session";

test("administration : indicateurs, règles économiques et probabilités des boosters", async ({ page, baseURL }) => {
  const connectionString = process.env.TEST_DATABASE_URL;
  test.skip(!connectionString, "TEST_DATABASE_URL est nécessaire pour tester l’administration réelle.");
  test.setTimeout(120_000);
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: connectionString! }) });
  const token = randomUUID();
  // The scenario edits the shared configuration: it is saved first and restored in all cases.
  const config = await prisma.gameConfiguration.findUniqueOrThrow({ where: { id: "default" } });
  let adminId = "", boosterId = "";
  try {
    adminId = (await prisma.user.create({ data: { name: `Admin ${token}`, role: "ADMIN" } })).id;
    boosterId = (await prisma.boosterType.create({ data: { slug: `admin-e2e-${token}`, nameFr: `Booster ${token}`, category: "MULTISPORT",
      weights: { create: [["COMMON", 5500], ["UNCOMMON", 2500], ["RARE", 1200], ["EPIC", 500], ["LEGENDARY", 250], ["MYTHIC", 50]]
        .map(([rarity, weightBasisPoints]) => ({ rarity: rarity as "COMMON", weightBasisPoints: weightBasisPoints as number })) } } })).id;
    await page.context().addCookies([await sessionCookie(adminId, baseURL!)]);
    await page.goto("/admin");
    await expect(page.getByRole("heading", { name: "Cartes frappées par rareté" })).toBeVisible();
    await expect(page.getByText("Joueurs inscrits")).toBeVisible();
    await page.getByRole("link", { name: "Règles économiques et boosters" }).click();

    const resale = page.getByLabel("Rachat par la banque (%)", { exact: true });
    await expect(resale).toHaveValue(String(config.bankResaleBasisPoints / 100));
    // Typing updates the preview only once the client form has hydrated; retry until it does.
    await expect(async () => { await resale.fill("100"); await expect(page.getByText(/Avec un rachat à 100 %/)).toBeVisible({ timeout: 1_000 }); }).toPass({ timeout: 15_000 });
    await resale.fill("55");
    await page.getByRole("button", { name: "Enregistrer les règles économiques" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Règles économiques enregistrées." })).toBeVisible();
    expect((await prisma.gameConfiguration.findUniqueOrThrow({ where: { id: "default" } })).bankResaleBasisPoints).toBe(5500);

    const form = page.getByRole("form", { name: `Réglages du booster Booster ${token}` });
    await form.getByLabel("Commune (%)", { exact: true }).fill("50");
    await expect(form.getByRole("alert")).toContainText("95 %");
    await expect(form.getByRole("button", { name: "Enregistrer le booster" })).toBeDisabled();
    await form.getByLabel("Peu commune (%)", { exact: true }).fill("30");
    await form.getByRole("button", { name: "Enregistrer le booster" }).click();
    await expect(form.getByRole("status")).toHaveText("Booster enregistré.");
    expect((await prisma.boosterRarityWeight.findUniqueOrThrow({ where: { boosterTypeId_rarity: { boosterTypeId: boosterId, rarity: "UNCOMMON" } } })).weightBasisPoints).toBe(3000);
    await page.reload();
    await expect(page.getByText("Règles économiques modifiées").first()).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  } finally {
    await prisma.$transaction(async (tx) => {
      await tx.gameConfiguration.update({ where: { id: "default" }, data: { startingBalance: config.startingBalance,
        bankResaleBasisPoints: config.bankResaleBasisPoints, passiveIntervalSeconds: config.passiveIntervalSeconds, passiveMaxStock: config.passiveMaxStock } });
      if (boosterId) await tx.boosterType.delete({ where: { id: boosterId } });
      if (adminId) {
        await tx.adminAuditLog.deleteMany({ where: { actorId: adminId } });
        await tx.rateLimitBucket.deleteMany({ where: { key: { contains: adminId } } });
        await tx.user.delete({ where: { id: adminId } });
      }
    });
    await prisma.$disconnect();
  }
});
