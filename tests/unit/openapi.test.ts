import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
import { apiOperations, buildOpenApiDocument } from "@/server/api-docs/openapi";
import { GET as openApiRoute } from "@/app/api/openapi/route";
import { GET as docsPage } from "@/app/api-docs/route";

const apiRoot = join(process.cwd(), "src", "app", "api");
// Sign-in, sign-out and session routes belong to Auth.js and are not part of the game API.
const undocumented = new Set(["/api/auth/{nextauth}"]);

function routeOperations() {
  const found: string[] = [];
  for (const file of readdirSync(apiRoot, { recursive: true }) as string[]) {
    if (!file.endsWith("route.ts")) continue;
    const segments = relative(apiRoot, join(apiRoot, file)).split(sep).slice(0, -1);
    const path = "/api/" + segments.map((segment) => segment.replace(/^\[(?:\.\.\.)?(\w+)\]$/, "{$1}")).join("/");
    if (undocumented.has(path)) continue;
    const source = readFileSync(join(apiRoot, file), "utf8");
    for (const [, method] of source.matchAll(/export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE)\b/g)) {
      found.push(`${method!.toLowerCase()} ${path.replace(/\/$/, "")}`);
    }
  }
  return found.sort();
}

afterEach(() => { vi.unstubAllEnvs(); });

describe("documentation OpenAPI", () => {
  it("documente exactement les Route Handlers existants", () => {
    const documented = apiOperations.map((operation) => `${operation.method} ${operation.path}`).sort();
    expect(documented).toEqual(routeOperations());
  });

  it("génère un document OpenAPI 3.1 valide pour chaque opération", () => {
    const document = buildOpenApiDocument();
    expect(document.openapi).toBe("3.1.0");
    for (const operation of apiOperations) {
      const generated = document.paths[operation.path]?.[operation.method] as { responses: Record<string, unknown>; requestBody?: unknown };
      expect(generated, `${operation.method} ${operation.path}`).toBeDefined();
      expect(Object.keys(generated.responses)).toContain(String(operation.successStatus ?? 200));
      expect(Object.keys(generated.responses)).toContain("500");
      expect(Boolean(generated.requestBody)).toBe(Boolean(operation.body));
    }
    expect(JSON.stringify(document)).not.toContain("$schema");
  });

  it("décrit les corps de requête à partir des schémas Zod", () => {
    const document = buildOpenApiDocument();
    const open = document.paths["/api/boosters/open"]?.post as { requestBody: { content: { "application/json": { schema: { properties: Record<string, unknown>; required: string[] } } } } };
    const schema = open.requestBody.content["application/json"].schema;
    expect(Object.keys(schema.properties)).toEqual(["boosterTypeId", "sportId", "source"]);
    expect(schema.required).toEqual(["boosterTypeId", "source"]);
  });

  it("expose les paramètres de requête avec leurs valeurs par défaut facultatives", () => {
    const document = buildOpenApiDocument();
    const cards = document.paths["/api/me/cards"]?.get as { parameters: { name: string; required: boolean }[] };
    const page = cards.parameters.find((parameter) => parameter.name === "page");
    expect(page?.required).toBe(false);
    expect(cards.parameters.map((parameter) => parameter.name)).toContain("sort");
  });

  it("sert le document et la page en développement", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const response = openApiRoute();
    expect(response.status).toBe(200);
    expect((await response.json()).info.title).toBe("API Elite Pack");
    expect(docsPage().headers.get("content-type")).toContain("text/html");
  });

  it("masque la documentation en production sauf activation explicite", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const hidden = openApiRoute();
    expect(hidden.status).toBe(404);
    expect((await hidden.json()).error.code).toBe("NOT_FOUND");
    expect(docsPage().status).toBe(404);
    vi.stubEnv("API_DOCS_ENABLED", "true");
    expect(openApiRoute().status).toBe(200);
  });
});
