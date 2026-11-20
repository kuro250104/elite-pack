import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { GET, POST } from "@/app/api/me/wishlist/route";
import { DELETE } from "@/app/api/me/wishlist/[editionId]/route";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(), reserve: vi.fn(), list: vi.fn(), add: vi.fn(), remove: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/db/prisma", () => ({ db: {} }));
vi.mock("@/server/game/api", () => ({ reserveGameRequest: mocks.reserve }));
vi.mock("@/server/wishlist/service", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/server/wishlist/service")>(),
  listWishlist: mocks.list,
  addToWishlist: mocks.add,
  removeFromWishlist: mocks.remove,
}));

const origin = "https://elite.example";
const endpoint = `${origin}/api/me/wishlist`;
const context = { params: Promise.resolve({ editionId: "edition-a" }) };
function post(body: unknown, headers: HeadersInit = { origin, "Content-Type": "application/json" }) {
  return new Request(endpoint, { method: "POST", headers, body: JSON.stringify(body) });
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("AUTH_URL", origin);
  mocks.auth.mockResolvedValue({ user: { id: "session-player" } });
});
afterEach(() => vi.unstubAllEnvs());

it("exige une session pour toute opération", async () => {
  mocks.auth.mockResolvedValue(null);
  const results = await Promise.all([
    GET(new Request(endpoint)),
    POST(post({ editionId: "edition-a" })),
    DELETE(new Request(`${endpoint}/edition-a`, { method: "DELETE", headers: { origin } }), context),
  ]);
  expect(results.map((result) => result.status)).toEqual([401, 401, 401]);
  expect(mocks.reserve).not.toHaveBeenCalled();
});

it("rejette les mutations sans origine autorisée, sans JSON ou avec un corps invalide", async () => {
  expect((await POST(post({ editionId: "edition-a" }, { "Content-Type": "application/json" }))).status).toBe(403);
  expect((await DELETE(new Request(`${endpoint}/edition-a`, { method: "DELETE", headers: { origin: "https://autre.example" } }), context)).status).toBe(403);
  expect((await POST(post({ editionId: "edition-a" }, { origin }))).status).toBe(415);
  expect((await POST(post({ editionId: "" }))).status).toBe(400);
  expect((await POST(post({ editionId: "edition-a", userId: "autre-joueur" }))).status).toBe(400);
  expect(mocks.add).not.toHaveBeenCalled();
  expect(mocks.remove).not.toHaveBeenCalled();
});

it("utilise le joueur de la session et renvoie 201 puis 200 à la répétition", async () => {
  mocks.add.mockResolvedValueOnce({ created: true }).mockResolvedValueOnce({ created: false });
  expect((await POST(post({ editionId: "edition-a" }))).status).toBe(201);
  expect((await POST(post({ editionId: "edition-a" }))).status).toBe(200);
  expect(mocks.add).toHaveBeenNthCalledWith(1, "session-player", { editionId: "edition-a" });
  expect(mocks.add).toHaveBeenNthCalledWith(2, "session-player", { editionId: "edition-a" });
  expect(mocks.reserve).toHaveBeenCalledWith("session-player", true);
  expect((await GET(new Request(`${endpoint}?page=2`))).status).toBe(200);
  expect(mocks.list).toHaveBeenCalledWith("session-player", { page: "2" });
  mocks.remove.mockResolvedValue({ removed: true });
  const result = await DELETE(new Request(`${endpoint}/edition-a`, { method: "DELETE", headers: { origin } }), context);
  expect(await result.json()).toEqual({ data: { removed: true } });
  expect(mocks.remove).toHaveBeenCalledWith("session-player", "edition-a");
});
