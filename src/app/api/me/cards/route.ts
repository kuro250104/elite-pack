import { requireApiUser, success, failure } from "@/lib/api/http";
import { listCollection } from "@/server/collection/service";
import { reserveGameRequest } from "@/server/game/api";
export async function GET(request: Request) { try {
    const actor = await requireApiUser();
    await reserveGameRequest(actor.id);
    return success(await listCollection(actor.id, Object.fromEntries(new URL(request.url).searchParams)));
}
catch (error) {
    return failure(error);
} }
