import { beforeEach, expect, it, vi } from "vitest";
import { GET } from "@/app/api/me/wallet/route";
import { ApiError } from "@/lib/api/errors";
import { walletHistoryQuerySchema } from "@/server/wallet/history";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), reserveGameRequest: vi.fn(), getWalletHistory: vi.fn() }));
vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/db/prisma", () => ({ db: {} }));
vi.mock("@/server/game/api", () => ({ reserveGameRequest: mocks.reserveGameRequest }));
vi.mock("@/server/wallet/history", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/server/wallet/history")>(),
  getWalletHistory: mocks.getWalletHistory,
}));

const url = "https://elite.example/api/me/wallet";
beforeEach(() => {
  vi.resetAllMocks();
  mocks.auth.mockResolvedValue({ user: { id: "joueur-session" } });
  mocks.getWalletHistory.mockImplementation(async (_actorId: string, input: unknown) => {
    walletHistoryQuerySchema.parse(input);
    return { balance: "9007199254740993", transactions: [], total: 0 };
  });
});

it("refuse la lecture sans session", async () => {
  mocks.auth.mockResolvedValue(null);
  const result = await GET(new Request(url));
  expect(result.status).toBe(401);
  expect(mocks.getWalletHistory).not.toHaveBeenCalled();
});

it("rejette une pagination invalide", async () => {
  const result = await GET(new Request(`${url}?pageSize=51`));
  expect(result.status).toBe(400);
  expect(await result.json()).toMatchObject({ error: { code: "INVALID_INPUT" } });
});

it("utilise uniquement le joueur de la session", async () => {
  const result = await GET(new Request(`${url}?page=2&type=REWARD`));
  expect(result.status).toBe(200);
  expect(await result.json()).toMatchObject({ data: { balance: "9007199254740993" } });
  expect(mocks.reserveGameRequest).toHaveBeenCalledWith("joueur-session");
  expect(mocks.getWalletHistory).toHaveBeenCalledWith("joueur-session", { page: "2", type: "REWARD" });
  expect((await GET(new Request(`${url}?walletId=autre`))).status).toBe(400);
});

it("rend l’erreur 404 du portefeuille absent", async () => {
  mocks.getWalletHistory.mockRejectedValue(new ApiError("WALLET_NOT_FOUND", "Votre portefeuille est introuvable.", 404));
  const result = await GET(new Request(url));
  expect(result.status).toBe(404);
  expect(await result.json()).toMatchObject({ error: { code: "WALLET_NOT_FOUND" } });
});
