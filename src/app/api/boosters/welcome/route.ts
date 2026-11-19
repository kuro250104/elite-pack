import { z } from "zod";
import { requireApiUser, assertSameOrigin, readJson, success, failure } from "@/lib/api/http";
import { db } from "@/lib/db/prisma";
import { claimWelcomeBooster } from "@/server/game/catalog";
import { reserveGameRequest } from "@/server/game/api";
export async function POST(request: Request) { try {
    const actor = await requireApiUser();
    assertSameOrigin(request);
    await readJson(request, z.object({}).strict());
    await reserveGameRequest(actor.id, true);
    return success(await db.$transaction(tx => claimWelcomeBooster(tx, actor.id)));
}
catch (error) {
    return failure(error);
} }
