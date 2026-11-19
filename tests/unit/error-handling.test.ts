import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
import { ApiError } from "@/lib/api/errors";
import { isDatabaseUnavailable, toApiError } from "@/lib/api/error-mapping";
import { failure } from "@/lib/api/http";
import { apiErrorMessage } from "@/lib/api/client-errors";
import { logger, redact } from "@/lib/logger";

class FakePrismaError extends Error {
  constructor(public readonly code: string, name = "PrismaClientKnownRequestError") { super(`Prisma ${code}`); this.name = name; }
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
let logs: { out: string[]; err: string[] };

beforeEach(() => {
  logs = { out: [], err: [] };
  vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => { logs.out.push(args.join(" ")); });
  vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => { logs.err.push(args.join(" ")); });
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

describe("conversion des erreurs en contrat d’API", () => {
  it.each([
    ["ApiError conservée", new ApiError("LISTING_SOLD", "Cette carte vient d’être vendue.", 409), 409, "LISTING_SOLD"],
    ["Zod → 400", new z.ZodError([]), 400, "INVALID_INPUT"],
    ["P2002 doublon → 409", new FakePrismaError("P2002"), 409, "CONFLICT"],
    ["P2025 absent → 404", new FakePrismaError("P2025"), 404, "NOT_FOUND"],
    ["P2034 conflit de transaction → 409", new FakePrismaError("P2034"), 409, "CONCURRENT_UPDATE"],
    ["P1001 base injoignable → 503", new FakePrismaError("P1001"), 503, "SERVICE_UNAVAILABLE"],
    ["initialisation Prisma → 503", new FakePrismaError("", "PrismaClientInitializationError"), 503, "SERVICE_UNAVAILABLE"],
    ["crash inconnu → 500", new TypeError("Cannot read properties of undefined"), 500, "INTERNAL_ERROR"],
  ])("%s", (_label, error, status, code) => {
    const safe = toApiError(error);
    expect(safe.status).toBe(status);
    expect(safe.code).toBe(code);
  });

  it("reconnaît une connexion refusée dans la chaîne des causes", () => {
    const refused = Object.assign(new Error("connect ECONNREFUSED 127.0.0.1:5432"), { code: "ECONNREFUSED" });
    expect(isDatabaseUnavailable(new Error("Échec de la requête", { cause: refused }))).toBe(true);
    expect(isDatabaseUnavailable(new Error("autre"))).toBe(false);
  });
});

describe("failure()", () => {
  it("renvoie le même identifiant dans l’en-tête et dans le corps", async () => {
    const response = failure(new ApiError("UNAUTHENTICATED", "Veuillez vous connecter.", 401));
    const body = await response.json();
    expect(response.status).toBe(401);
    expect(body.error.requestId).toMatch(uuid);
    expect(response.headers.get("x-request-id")).toBe(body.error.requestId);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("en production : message générique, aucun détail, erreur complète dans un journal JSON", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const crash = new TypeError("Cannot read properties of undefined (reading 'wallet')");
    const response = failure(crash);
    const body = await response.json();
    expect(response.status).toBe(500);
    expect(body.error).toEqual({ code: "INTERNAL_ERROR", message: "Le service est temporairement indisponible.", requestId: body.error.requestId });
    expect(JSON.stringify(body)).not.toContain("wallet");
    const entry = JSON.parse(logs.err.at(-1)!);
    expect(entry).toMatchObject({ level: "error", message: "Erreur serveur", requestId: body.error.requestId, status: 500, code: "INTERNAL_ERROR" });
    expect(entry.error.message).toContain("wallet");
    expect(entry.error.stack).toContain("TypeError");
  });

  it("en développement : détail de l’erreur d’origine dans « debug », secrets masqués", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const body = await failure(new Error("connexion postgresql://elite:motdepasse@db:5432/elite refusée")).json();
    expect(body.error.debug.name).toBe("Error");
    expect(body.error.debug.message).toContain("postgresql://***@db:5432");
    expect(JSON.stringify(body)).not.toContain("motdepasse");
    expect(logs.err.join("\n")).not.toContain("motdepasse");
  });

  it("ne journalise qu’un code pour un refus attendu (4xx)", () => {
    vi.stubEnv("NODE_ENV", "production");
    failure(new ApiError("FORBIDDEN", "Cette action est réservée aux administrateurs.", 403));
    expect(logs.err).toHaveLength(0);
    const entry = JSON.parse(logs.out.at(-1)!);
    expect(entry).toMatchObject({ level: "info", message: "Requête refusée", status: 403, code: "FORBIDDEN" });
    expect(entry.error).toBeUndefined();
  });

  it("invite à réessayer quand la base est indisponible", () => {
    const response = failure(new FakePrismaError("P1001"));
    expect(response.status).toBe(503);
    expect(response.headers.get("retry-after")).toBe("5");
  });
});

describe("journalisation", () => {
  it("masque les secrets dans les messages", () => {
    expect(redact("postgres://user:pass@host/db")).toBe("postgres://***@host/db");
    expect(redact("Authorization: Bearer abc.def.ghi")).toContain("Bearer ***");
    expect(redact("password=hunter2 et token: xyz")).toBe("password=*** et token=***");
    expect(redact("GET https://www.thesportsdb.com/api/v1/json/987654/lookupplayer.php?id=1")).toBe("GET https://www.thesportsdb.com/api/v1/json/***/lookupplayer.php?id=1");
  });

  it("masque les champs sensibles et respecte LOG_LEVEL", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("LOG_LEVEL", "warn");
    logger.info("ignoré");
    expect(logs.out).toHaveLength(0);
    logger.warn("Connexion suspecte", { authorization: "Bearer secret", cookie: "authjs.session-token=abc", userId: "u1" });
    const entry = JSON.parse(logs.err.at(-1)!);
    expect(entry).toMatchObject({ level: "warn", authorization: "***", cookie: "***", userId: "u1" });
  });
});

describe("message affiché côté navigateur", () => {
  it("ajoute une référence courte aux erreurs serveur uniquement", () => {
    const payload = { error: { code: "INTERNAL_ERROR", message: "Le service est temporairement indisponible.", requestId: "3f0c2a9e-6b1d-4e7a-9c55-0d2f6a1b8e41" } };
    expect(apiErrorMessage(payload, 500, "Échec")).toBe("Le service est temporairement indisponible. (référence 3f0c2a9e)");
    expect(apiErrorMessage({ error: { message: "Solde insuffisant." } }, 409, "Échec")).toBe("Solde insuffisant.");
    expect(apiErrorMessage(null, 502, "Le serveur ne répond pas.")).toBe("Le serveur ne répond pas.");
  });
});
