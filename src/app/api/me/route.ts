import { requireApiUser, success, failure } from "@/lib/api/http";
import { getPlayerProfile } from "@/server/players/profile";
import { reserveGameRequest } from "@/server/game/api";
export async function GET() { try {
    const actor = await requireApiUser();
    await reserveGameRequest(actor.id);
    return success(await getPlayerProfile(actor.id));
}
catch (error) {
    return failure(error);
} }
