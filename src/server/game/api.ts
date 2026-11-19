import "server-only";
import { db } from "@/lib/db/prisma";
import { consumeRateLimit } from "@/server/security/rate-limit";
export async function reserveGameRequest(actorId: string, mutation = false) {
    await db.$transaction(tx => consumeRateLimit(tx, `game-api:${mutation ? "write" : "read"}:${actorId}`, { limit: mutation ? 20 : 60, windowSeconds: 60 }));
}
