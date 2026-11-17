import { requireApiUser, success, failure } from "@/lib/api/http";
import { listOpeningHistory } from "@/server/boosters/history";
import { reserveGameRequest } from "@/server/game/api";
export async function GET(request: Request) { try {
    const actor = await requireApiUser();
    await reserveGameRequest(actor.id);
    return success(await listOpeningHistory(actor.id, Object.fromEntries(new URL(request.url).searchParams)));
}
catch (error) {
    return failure(error);
} }
