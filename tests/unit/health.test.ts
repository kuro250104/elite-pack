import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ queryRaw: vi.fn() }));
vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/db/prisma", () => ({ db: { $queryRaw: mocks.queryRaw } }));
import { GET } from "@/app/api/health/route";

beforeEach(() => { mocks.queryRaw.mockReset(); });
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe("GET /api/health", () => {
  it("répond 200 lorsque PostgreSQL répond", async () => {
    mocks.queryRaw.mockResolvedValue([{ "?column?": 1 }]);
    const response = await GET();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: { status: "ok", database: "ok" } });
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("répond 503 sans détail technique lorsque la base est injoignable", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.queryRaw.mockRejectedValue(new Error("connect ECONNREFUSED 127.0.0.1:5432 password=secret"));
    const response = await GET();
    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body.error.code).toBe("SERVICE_UNAVAILABLE");
    expect(JSON.stringify(body)).not.toMatch(/ECONNREFUSED|5432|secret/);
  });
});
