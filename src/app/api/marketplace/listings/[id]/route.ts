import { requireApiUser, assertSameOrigin, success, failure } from "@/lib/api/http";
import { cancelListing } from "@/server/marketplace/service";
import { reserveGameRequest } from "@/server/game/api";
export async function DELETE(request: Request, context: {params: Promise<{id: string}>}) { try {
    const actor = await requireApiUser();
    assertSameOrigin(request);
    const {id} = await context.params;
    await reserveGameRequest(actor.id, true);
    return success(await cancelListing(actor.id, id));
}
catch (error) {
    return failure(error);
} }
