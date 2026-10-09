import { describe, expect, it } from "vitest";
import type { Prisma } from "@/generated/prisma/client";
import { consumeRateLimit, deferRateLimit } from "@/server/security/rate-limit";

describe("Configuration de quota", () => {
  it.each([0, -1, 1.5, 86401])("rejette un délai invalide %s", async (seconds) => {
    await expect(deferRateLimit({} as Prisma.TransactionClient, "test", seconds)).rejects.toThrow("Délai de limitation invalide");
  });

  it.each([
    { limit: 0, windowSeconds: 60 },
    { limit: 1.5, windowSeconds: 60 },
    { limit: 1, windowSeconds: 0 },
    { limit: 1, windowSeconds: 60, minIntervalMs: -1 },
  ])("rejette une configuration invalide avant toute requête", async (options) => {
    const tx = {} as Prisma.TransactionClient;
    await expect(consumeRateLimit(tx, "test", options)).rejects.toThrow("Configuration de limitation invalide");
  });
});
