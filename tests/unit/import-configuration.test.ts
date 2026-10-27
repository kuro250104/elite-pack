import { describe, expect, it, vi } from "vitest";
import { getSportsDbConfigurationStatus, requireSportsDbConfiguration } from "@/server/imports/configuration";
import { configuredProvider } from "@/server/imports/service";
vi.mock("@/lib/db/prisma", () => ({ db: {} }));
describe("configuration TheSportsDB", () => {
  it("exige une configuration explicite sans clé par défaut", () => {
    expect(getSportsDbConfigurationStatus({})).toEqual({ configured: false, mode: null });
    expect(() => requireSportsDbConfiguration({ THESPORTSDB_API_KEY: "123" })).toThrow();
  });
  it("autorise la clé publique en développement uniquement", () => {
    expect(getSportsDbConfigurationStatus({ THESPORTSDB_MODE: "development", THESPORTSDB_API_KEY: "123", NODE_ENV: "development" })).toEqual({ configured: true, mode: "development" });
    for (const key of ["123", "3"]) {
      for (const mode of ["development", "personal"]) {
        expect(() => requireSportsDbConfiguration({ THESPORTSDB_MODE: mode, THESPORTSDB_API_KEY: key, NODE_ENV: "production" })).toThrow();
      }
    }
  });
  it("sépare la clé personnelle et ne l’expose jamais dans le statut", () => {
    const environment = { THESPORTSDB_MODE: "personal", THESPORTSDB_API_KEY: "987654321", NODE_ENV: "production" };
    expect(getSportsDbConfigurationStatus(environment)).toEqual({ configured: true, mode: "personal" });
    expect(JSON.stringify(getSportsDbConfigurationStatus(environment))).not.toContain(environment.THESPORTSDB_API_KEY);
    expect(() => requireSportsDbConfiguration({ ...environment, THESPORTSDB_MODE: "invalid" })).toThrow();
  });
  it("refuse les valeurs invalides sans les inclure dans l’erreur", () => {
    const secret = "unexpected-sensitive-value";
    try { requireSportsDbConfiguration({ THESPORTSDB_MODE: "personal", THESPORTSDB_API_KEY: secret }); }
    catch (error) { expect(String(error)).not.toContain(secret); }
  });
  it("bloque configuredProvider avant toute requête en production", () => {
    vi.stubEnv("NODE_ENV", "production"); vi.stubEnv("THESPORTSDB_MODE", "development"); vi.stubEnv("THESPORTSDB_API_KEY", "123");
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    try { expect(() => configuredProvider()).toThrow(); expect(fetcher).not.toHaveBeenCalled(); }
    finally { vi.unstubAllEnvs(); vi.unstubAllGlobals(); }
  });
});
