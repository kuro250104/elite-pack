import { requireApiAdmin, assertSameOrigin, readJson, success, failure } from "@/lib/api/http";
import { db } from "@/lib/db/prisma";
import { reserveAdminRequest } from "@/server/imports/service";
import { athletePatchSchema } from "@/server/athletes/validation";
import { updateAthlete } from "@/server/athletes/service";
export async function PATCH(request: Request, context: {params: Promise<{id: string}>}) {
  try {
    const actor = await requireApiAdmin(); assertSameOrigin(request);
    const {id} = await context.params;
    const patch = await readJson(request, athletePatchSchema);
    await reserveAdminRequest(actor.id);
    return success(await db.$transaction(tx => updateAthlete(tx, id, patch, actor.id)));
  } catch (error) {return failure(error);}
}
