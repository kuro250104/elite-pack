import { requireApiUser, success, failure } from "@/lib/api/http";
import { listSportsCatalogue } from "@/server/sports/catalogue";
import { reserveGameRequest } from "@/server/game/api";
export async function GET() { try {
    const actor = await requireApiUser();
    await reserveGameRequest(actor.id);
    return success({ sports: await listSportsCatalogue(actor.id) });
}
catch (error) {
    return failure(error);
} }
