import { requireApiUser, success, failure } from "@/lib/api/http";
import { listEncyclopedia } from "@/server/athletes/encyclopedia";
import { reserveGameRequest } from "@/server/game/api";
export async function GET(request: Request) { try {
    const actor = await requireApiUser();
    await reserveGameRequest(actor.id);
    return success(await listEncyclopedia(actor.id, Object.fromEntries(new URL(request.url).searchParams)));
}
catch (error) {
    return failure(error);
} }
