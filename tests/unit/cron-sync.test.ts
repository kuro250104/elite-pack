import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
const syncAthletes = vi.fn(async () => ({ candidates: 2, processed: 2, updated: 1, failed: 0, stoppedByQuota: false, results: [{ name: "Secret" }] }));
vi.mock("@/server/imports/sync", () => ({ syncAthletes }));

const call = async (authorization?: string) => {
  const { GET } = await import("@/app/api/cron/sync-athletes/route");
  return GET(new Request("https://example.test/api/cron/sync-athletes", authorization ? { headers: { authorization } } : {}));
};
afterEach(() => { vi.unstubAllEnvs(); syncAthletes.mockClear(); });

describe("Tâche planifiée de synchronisation", () => {
  it("refuse sans configuration, sans secret ou avec un mauvais secret, sans lancer de synchronisation", async () => {
    vi.stubEnv("CRON_SECRET", ""); vi.stubEnv("SYNC_ACTOR_ID", "");
    expect((await call("Bearer x")).status).toBe(503);
    vi.stubEnv("CRON_SECRET", "secret-de-test-assez-long"); vi.stubEnv("SYNC_ACTOR_ID", "admin-id");
    expect((await call()).status).toBe(401);
    expect((await call("Bearer mauvais-secret-de-test")).status).toBe(401);
    expect((await call("secret-de-test-assez-long")).status).toBe(401);
    expect(syncAthletes).not.toHaveBeenCalled();
  });

  it("lance un lot avec l’administrateur configuré et ne renvoie que des compteurs", async () => {
    vi.stubEnv("CRON_SECRET", "secret-de-test-assez-long"); vi.stubEnv("SYNC_ACTOR_ID", "admin-id");
    const response = await call("Bearer secret-de-test-assez-long");
    expect(response.status).toBe(200);
    expect(syncAthletes).toHaveBeenCalledWith("admin-id");
    const body = await response.json();
    expect(body.data).toEqual({ candidates: 2, processed: 2, updated: 1, failed: 0, stoppedByQuota: false });
    expect(JSON.stringify(body)).not.toContain("Secret");
  });
});
