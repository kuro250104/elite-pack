import { requireApiUser, assertSameOrigin, success, failure } from "@/lib/api/http";
import { buyListing } from "@/server/marketplace/service";
import { reserveGameRequest } from "@/server/game/api";
export async function POST(request: Request, context: {params: Promise<{id: string}>}) { try {
    const actor = await requireApiUser();
    assertSameOrigin(request);
    const {id} = await context.params;
    await reserveGameRequest(actor.id, true);
    return success(await buyListing(actor.id, id, request.headers.get("Idempotency-Key") ?? ""));
}
catch (error) {
    return failure(error);
} }
