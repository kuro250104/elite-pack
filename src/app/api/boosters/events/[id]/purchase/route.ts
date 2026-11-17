import { requireApiUser, assertSameOrigin, success, failure } from "@/lib/api/http";
import { purchaseEventBooster } from "@/server/boosters/events";
import { reserveGameRequest } from "@/server/game/api";
export async function POST(request: Request, context: {params: Promise<{id: string}>}) { try {
    const actor = await requireApiUser();
    assertSameOrigin(request);
    const {id} = await context.params;
    await reserveGameRequest(actor.id, true);
    return success(await purchaseEventBooster(actor.id, id, request.headers.get("Idempotency-Key") ?? ""));
}
catch (error) {
    return failure(error);
} }
