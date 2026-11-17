import { requireApiUser, assertSameOrigin, readJson, success, failure } from "@/lib/api/http";
import { bankSaleSchema, sellToBank } from "@/server/economy/bank";
import { reserveGameRequest } from "@/server/game/api";
export async function POST(request: Request) { try {
    const actor = await requireApiUser();
    assertSameOrigin(request);
    const input = await readJson(request, bankSaleSchema);
    await reserveGameRequest(actor.id, true);
    return success(await sellToBank(actor.id, input, request.headers.get("Idempotency-Key") ?? ""));
}
catch (error) {
    return failure(error);
} }
