import {sessionCookie} from "./auth-session";
import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../src/generated/prisma/client";

test("administration réelle : autorisations, corrections et mobile", async ({page, baseURL}) => {
  const connectionString = process.env.TEST_DATABASE_URL;
  test.skip(!connectionString, "TEST_DATABASE_URL est nécessaire pour le parcours administrateur réel.");
  const prisma = new PrismaClient({adapter: new PrismaPg({connectionString: connectionString!})});
  const token = randomUUID();
  const user = await prisma.user.create({data: {role: "ADMIN", name: "Admin de test"}});
  const sport = await prisma.sport.create({data: {slug: `e2e-${token}`, nameFr: `Sport test ${token}`, providerName: `Source ${token}`}});
  const athlete = await prisma.athlete.create({data: {name: `Athlète ${token}`, sportId: sport.id, nationality: "France"}});
  try {
    await page.context().addCookies([await sessionCookie(user.id,baseURL!)]);
    await page.goto("/admin/imports");
    await expect(page.getByRole("heading", {name: "Imports et catalogue sportif"})).toBeVisible();
    const article = page.locator("#sports article").filter({hasText: sport.nameFr});
    await article.getByLabel("Nom français").fill(`Discipline ${token}`);
    await article.getByLabel("Activé", {exact: true}).check();
    await article.getByRole("button", {name: "Enregistrer", exact: true}).click();
    await expect(page.locator("#sports article").filter({hasText: `Discipline ${token}`})).toBeVisible();
    expect(await prisma.sport.findUnique({where: {id: sport.id}})).toMatchObject({nameFr: `Discipline ${token}`, active: true});
    const row = page.locator("#athletes article").filter({hasText: athlete.name});
    await row.getByText("Corriger les données", {exact: true}).click();
    await row.getByLabel("Nom complet").fill(`Corrigé ${token}`);
    await row.getByRole("button", {name: "Enregistrer les corrections"}).click();
    await expect(page.locator("#athletes article").filter({hasText: `Corrigé ${token}`})).toBeVisible();
    expect(await prisma.athlete.findUnique({where: {id: athlete.id}})).toMatchObject({name: `Corrigé ${token}`, administratorOverrides: {name: true}, nationality: "France"});
    const unauthorizedOrigin = await page.request.patch(`/api/admin/sports/${sport.id}`, {headers: {origin: "https://evil.invalid"}, data: {active: false}});
    expect(unauthorizedOrigin.status()).toBe(403);
    const imports = await page.request.get("/api/admin/imports?pageSize=10");
    expect(imports.status()).toBe(200);
    expect((await imports.json()).data.pageSize).toBe(10);
    await page.setViewportSize({width: 390, height: 844});
    await page.screenshot({path: "/tmp/elite-pack-admin-mobile.png", fullPage: true});
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await prisma.user.update({where: {id: user.id}, data: {role: "PLAYER"}});
    expect((await page.request.get("/api/admin/imports")).status()).toBe(403);
    await page.goto("/admin/imports");
    await expect(page).toHaveURL(/\/dashboard/);
  } finally {
    await prisma.$transaction(async tx => {
      await tx.adminAuditLog.deleteMany({where: {actorId: user.id}});
      await tx.importJob.deleteMany({where: {actorId: user.id}});
      await tx.rateLimitBucket.deleteMany({where: {key: `admin-api:${user.id}`}});
      await tx.athlete.delete({where: {id: athlete.id}});
      await tx.sport.delete({where: {id: sport.id}});
      await tx.user.delete({where: {id: user.id}});
    });
    await prisma.$disconnect();
  }
});
