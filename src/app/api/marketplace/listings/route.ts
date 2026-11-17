import { requireApiUser, assertSameOrigin, readJson, success, failure } from "@/lib/api/http";
import { createListing, createListingSchema } from "@/server/marketplace/service";
import { reserveGameRequest } from "@/server/game/api";
export async function POST(request: Request) { try {
    const actor = await requireApiUser();
    assertSameOrigin(request);
    const input = await readJson(request, createListingSchema);
    await reserveGameRequest(actor.id, true);
    const result = await createListing(actor.id, input);
    return success(result, result.replay ? 200 : 201);
}
catch (error) {
    return failure(error);
} }
