import { requireApiUser, success, failure } from "@/lib/api/http";
import { getAthleteSheet } from "@/server/athletes/encyclopedia";
import { reserveGameRequest } from "@/server/game/api";
export async function GET(_request: Request, context: {params: Promise<{id: string}>}) { try {
    const actor = await requireApiUser();
    const {id} = await context.params;
    await reserveGameRequest(actor.id);
    return success(await getAthleteSheet(actor.id, id));
}
catch (error) {
    return failure(error);
} }
