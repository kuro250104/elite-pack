import { requireApiUser, success, failure } from "@/lib/api/http";
import { getPassiveBoosters } from "@/server/boosters/passive";
import { reserveGameRequest } from "@/server/game/api";
export async function GET() { try {
    const actor = await requireApiUser();
    await reserveGameRequest(actor.id);
    return success(await getPassiveBoosters(actor.id));
}
catch (error) {
    return failure(error);
} }
