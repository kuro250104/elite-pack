import { requireApiUser, success, failure } from "@/lib/api/http";
import { getGameCatalogue } from "@/server/game/catalog";
import { reserveGameRequest } from "@/server/game/api";
export async function GET() { try {
    const actor = await requireApiUser();
    await reserveGameRequest(actor.id);
    return success(await getGameCatalogue());
}
catch (error) {
    return failure(error);
} }
