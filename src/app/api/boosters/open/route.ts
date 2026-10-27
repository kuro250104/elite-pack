import { z } from "zod";
import { requireApiUser, assertSameOrigin, readJson, success, failure } from "@/lib/api/http";
import { openBooster } from "@/server/boosters/opening";
import { reserveGameRequest } from "@/server/game/api";
const schema = z.object({ boosterTypeId: z.string().min(1).max(100), sportId: z.string().min(1).max(100).optional(), source: z.enum(["passive", "welcome"]) }).strict();
export async function POST(request: Request) { try {
    const actor = await requireApiUser();
    assertSameOrigin(request);
    const input = await readJson(request, schema);
    const idempotencyKey = z.uuid().parse(request.headers.get("Idempotency-Key"));
    await reserveGameRequest(actor.id, true);
    return success(await openBooster(actor.id, { ...input, idempotencyKey }));
}
catch (error) {
    return failure(error);
} }
