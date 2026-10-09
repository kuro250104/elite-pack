import { requireApiAdmin, assertSameOrigin, readJson, success, failure } from "@/lib/api/http";
import { db } from "@/lib/db/prisma";
import { reserveAdminRequest } from "@/server/imports/service";
import { sportPatchSchema } from "@/server/sports/validation";
import { updateSport } from "@/server/sports/service";
export async function PATCH(request: Request, context: {params: Promise<{id: string}>}) {
  try {
    const actor = await requireApiAdmin(); assertSameOrigin(request);
    const {id} = await context.params;
    const patch = await readJson(request, sportPatchSchema);
    await reserveAdminRequest(actor.id);
    return success(await db.$transaction(tx => updateSport(tx, id, patch, actor.id)));
  } catch (error) {return failure(error);}
}
