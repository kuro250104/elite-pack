import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/errors";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(), runImport: vi.fn(), reserveAdminRequest: vi.fn(), reserveProviderRequest: vi.fn(),
  configuredProvider: vi.fn(), searchAthletes: vi.fn(), transaction: vi.fn(), updateAthlete: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/db/prisma", () => ({ db: { $transaction: mocks.transaction } }));
vi.mock("@/server/imports/service", () => ({
  runImport: mocks.runImport, reserveAdminRequest: mocks.reserveAdminRequest,
  configuredProvider: mocks.configuredProvider, reserveProviderRequest: mocks.reserveProviderRequest,
}));
vi.mock("@/server/athletes/service", () => ({ updateAthlete: mocks.updateAthlete }));
import { POST } from "@/app/api/admin/imports/route";
import { GET as search } from "@/app/api/admin/imports/search/route";
import { PATCH } from "@/app/api/admin/athletes/[id]/route";

function request(body: unknown = { kind: "athlete", externalId: "42" }, options: { origin?: string; key?: string | null; method?: string } = {}) {
  const headers: Record<string, string> = { "content-type": "application/json", origin: options.origin ?? "https://elite.example" };
  if (options.key !== null) headers["idempotency-key"] = options.key ?? "operation_123";
  return new Request("https://elite.example/api/admin/imports", { method: options.method ?? "POST", headers, body: JSON.stringify(body) });
}
function noSideEffects() {
  expect(mocks.runImport).not.toHaveBeenCalled();
  expect(mocks.configuredProvider).not.toHaveBeenCalled();
  expect(mocks.reserveProviderRequest).not.toHaveBeenCalled();
  expect(mocks.searchAthletes).not.toHaveBeenCalled();
  expect(mocks.transaction).not.toHaveBeenCalled();
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("AUTH_URL", "https://elite.example");
  mocks.auth.mockResolvedValue({ user: { id: "admin-id", role: "ADMIN" } });
  mocks.reserveAdminRequest.mockResolvedValue(undefined);
  mocks.reserveProviderRequest.mockResolvedValue(undefined);
  mocks.configuredProvider.mockReturnValue({ searchAthletes: mocks.searchAthletes });
});
afterEach(() => vi.unstubAllEnvs());

describe("protection des routes administratives", () => {
  it.each([
    [null, 401],
    [{ user: { id: "player-id", role: "PLAYER" } }, 403],
    [{ user: { role: "ADMIN" } }, 401],
  ])("refuse la session %j avant tout accès fournisseur", async (session, status) => {
    mocks.auth.mockResolvedValue(session);
    expect((await POST(request())).status).toBe(status);
    expect((await search(new Request("https://elite.example/api/admin/imports/search?query=Athlete"))).status).toBe(status);
    expect((await PATCH(request({ name: "Nom" }, { method: "PATCH" }), { params: Promise.resolve({ id: "42" }) })).status).toBe(status);
    noSideEffects();
    expect(mocks.reserveAdminRequest).not.toHaveBeenCalled();
  });

  it("bloque les origines étrangères et absentes avant toute mutation", async () => {
    expect((await POST(request(undefined, { origin: "https://evil.example" }))).status).toBe(403);
    const absent = request(); absent.headers.delete("origin");
    expect((await POST(absent)).status).toBe(403);
    noSideEffects();
  });

  it.each([
    { kind: "athlete", externalId: "42; DROP TABLE Athlete" },
    { kind: "athlete", externalId: "42", actorId: "other-admin" },
    { kind: "sports", approvedForDisplay: true },
    { kind: "unsupported" },
  ])("rejette les commandes invalides %j", async (body) => {
    expect((await POST(request(body))).status).toBe(400);
    noSideEffects();
  });

  it("impose une clé d’idempotence", async () => {
    expect((await POST(request(undefined, { key: null }))).status).toBe(400);
    expect((await POST(request(undefined, { key: "../secret" }))).status).toBe(400);
    noSideEffects();
  });

  it("interdit l’écriture directe des corrections internes et licences", async () => {
    for (const field of ["administratorOverrides", "prestigeScore", "image", "sportId"]) {
      const response = await PATCH(request({ [field]: "injected" }, { method: "PATCH" }), { params: Promise.resolve({ id: "42" }) });
      expect(response.status).toBe(400);
    }
    noSideEffects();
    expect(mocks.updateAthlete).not.toHaveBeenCalled();
  });

  it("masque les erreurs techniques et les clés fournisseur", async () => {
    mocks.runImport.mockRejectedValue(new Error("https://provider/api/987654321/private-key"));
    const response = await POST(request());
    const body = await response.text();
    expect(response.status).toBe(500);
    expect(body).toContain("INTERNAL_ERROR");
    expect(body).not.toContain("987654321");
    expect(body).not.toContain("private-key");
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("transmet uniquement l’acteur issu de la session et la commande validée", async () => {
    mocks.runImport.mockResolvedValue({ job: { id: "job-42", status: "COMPLETED" }, replay: false });
    const response = await POST(request());
    expect(response.status).toBe(201);
    expect(mocks.reserveAdminRequest).toHaveBeenCalledWith("admin-id");
    expect(mocks.runImport).toHaveBeenCalledWith("admin-id", "operation_123", { kind: "athlete", externalId: "42" });
  });

  it("propage le délai du quota partagé avant tout appel externe", async () => {
    mocks.reserveAdminRequest.mockRejectedValue(new ApiError("RATE_LIMITED", "Réessayez bientôt.", 429, 15));
    const response = await search(new Request("https://elite.example/api/admin/imports/search?query=Athlete"));
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("15");
    noSideEffects();
  });
});
