import { expect, test } from "@playwright/test";

// The Playwright server runs in development: the "debug" detail is expected in API errors.
test("erreur d’API : code, message français, identifiant et détail de développement", async ({ request }) => {
  const response = await request.get("/api/demo/erreur?type=validation");
  expect(response.status()).toBe(400);
  const body = await response.json();
  expect(body.error).toMatchObject({ code: "INVALID_INPUT", message: "Les données saisies sont invalides." });
  expect(response.headers()["x-request-id"]).toBe(body.error.requestId);
  expect(body.error.debug.name).toBe("ZodError");
});

test("erreur ORM réelle traduite en 404 et erreur SQL en 500", async ({ request }) => {
  const missing = await request.get("/api/demo/erreur?type=introuvable");
  expect(missing.status()).toBe(404);
  expect((await missing.json()).error.code).toBe("NOT_FOUND");

  const sql = await request.get("/api/demo/erreur?type=sql");
  expect(sql.status()).toBe(500);
  const body = await sql.json();
  expect(body.error).toMatchObject({ code: "INTERNAL_ERROR", message: "Le service est temporairement indisponible." });
  expect(JSON.stringify(body.error.debug)).toContain("table_inexistante_demo");
});

test("l’interface affiche le message de l’API et survit à un plantage JavaScript", async ({ page }) => {
  await page.goto("/demo/erreurs");
  await expect(page.getByRole("heading", { name: "Gestion des erreurs" })).toBeVisible();
  await page.getByRole("button", { name: "Carte déjà vendue (409)" }).click();
  // Next.js adds its own role="alert" route announcer: target the alert carrying the API message.
  await expect(page.getByRole("alert").filter({ hasText: "Cette carte vient d’être vendue." })).toBeVisible();

  await page.getByRole("button", { name: "Plantage JavaScript" }).click();
  await expect(page.getByRole("heading", { name: "Une erreur est survenue" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Réessayer" })).toBeVisible();
});
