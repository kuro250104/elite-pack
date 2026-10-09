import { defineConfig, devices } from "@playwright/test";
const port = Number(process.env.PLAYWRIGHT_PORT ?? 3100);
const baseURL = `http://127.0.0.1:${port}`;
export default defineConfig({
  testDir: "./tests/e2e",
  use: {baseURL, trace: "retain-on-failure"},
  projects: [{name: "chromium", use: {...devices["Desktop Chrome"]}}],
  webServer: {
    command: `npm run dev -- --hostname 127.0.0.1 --port ${port}`,
    url: baseURL,
    reuseExistingServer: false,
    env: {PLAYWRIGHT_TEST_SERVER: "1", AUTH_URL: baseURL,
      AUTH_SECRET: process.env.AUTH_SECRET ?? "local-playwright-secret-for-tests-only-32chars",
      DATABASE_URL: process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL ?? ""},
  },
});
