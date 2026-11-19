import { requireApiUser, success, failure } from "@/lib/api/http";
import { listEvents } from "@/server/boosters/events";
import { reserveGameRequest } from "@/server/game/api";
export async function GET() { try {
    const actor = await requireApiUser();
    await reserveGameRequest(actor.id);
    return success(await listEvents(actor.id));
}
catch (error) {
    return failure(error);
} }
