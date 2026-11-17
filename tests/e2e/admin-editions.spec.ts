import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../src/generated/prisma/client";
import { sessionCookie } from "./auth-session";

test("administration : créer une édition puis la modifier dans les limites autorisées", async ({ page, baseURL }) => {
  const connectionString = process.env.TEST_DATABASE_URL;
  test.skip(!connectionString, "TEST_DATABASE_URL est nécessaire pour tester l’administration réelle.");
  test.setTimeout(120_000);
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: connectionString! }) });
  const token = randomUUID();
  let adminId = "", sportId = "", athleteId = "";
  try {
    adminId = (await prisma.user.create({ data: { name: `Admin ${token}`, role: "ADMIN" } })).id;
    sportId = (await prisma.sport.create({ data: { slug: `editions-e2e-${token}`, nameFr: `Discipline ${token}`, providerName: `Fixture ${token}` } })).id;
    athleteId = (await prisma.athlete.create({ data: { name: `Athlète ${token}`, sportId } })).id;
    await page.context().addCookies([await sessionCookie(adminId, baseURL!)]);
    await page.goto(`/admin/editions?query=${token}`);
    const create = page.getByRole("form", { name: "Créer une édition" });
    await create.getByLabel("Nom de l’édition").fill("Champion");
    await create.getByLabel("Rareté").selectOption("EPIC");
    await create.getByLabel("Tirage limité").fill("3");
    await create.getByLabel("Active").check();
    // Server-rendered form: retry until the client handler is attached and the creation is confirmed.
    await expect(async () => {
      if (!await prisma.cardEdition.count({ where: { athleteId } })) await create.getByRole("button", { name: "Créer l’édition" }).click({ timeout: 2_000 });
      expect(await prisma.cardEdition.count({ where: { athleteId } })).toBe(1);
    }).toPass({ timeout: 15_000 });
    const edition = await prisma.cardEdition.findFirstOrThrow({ where: { athleteId } });
    expect(edition).toMatchObject({ name: "Champion", rarity: "EPIC", maxSupply: 3, active: true });

    await page.reload();
    const form = page.getByRole("form", { name: "Modifier l’édition Champion" });
    await expect(form).toBeVisible();
    // Below-minted supply is refused by the server and the message is shown.
    await prisma.cardEdition.update({ where: { id: edition.id }, data: { mintedSupply: 2 } });
    await page.reload();
    await expect(form.getByLabel("Rareté (verrouillée)")).toBeDisabled();
    await form.getByLabel("Tirage").fill("1");
    await form.getByRole("button", { name: "Enregistrer" }).click();
    await expect(form.getByRole("alert")).toContainText("2 exemplaires déjà frappés");
    await form.getByLabel("Tirage").fill("10");
    await form.getByRole("button", { name: "Enregistrer" }).click();
    await expect(form.getByRole("status")).toHaveText("Édition enregistrée.");
    expect((await prisma.cardEdition.findUniqueOrThrow({ where: { id: edition.id } })).maxSupply).toBe(10);
    await page.reload();
    await expect(page.getByText("Édition modifiée").first()).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  } finally {
    await prisma.$transaction(async (tx) => {
      if (athleteId) {
        const editions = (await tx.cardEdition.findMany({ where: { athleteId }, select: { id: true } })).map((row) => row.id);
        await tx.boosterEdition.deleteMany({ where: { editionId: { in: editions } } });
        await tx.cardEdition.deleteMany({ where: { id: { in: editions } } });
        await tx.athlete.delete({ where: { id: athleteId } });
      }
      if (sportId) await tx.sport.delete({ where: { id: sportId } });
      if (adminId) {
        await tx.adminAuditLog.deleteMany({ where: { actorId: adminId } });
        await tx.rateLimitBucket.deleteMany({ where: { key: { contains: adminId } } });
        await tx.user.delete({ where: { id: adminId } });
      }
    });
    await prisma.$disconnect();
  }
});
