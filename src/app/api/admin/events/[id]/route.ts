import { requireApiAdmin, assertSameOrigin, readJson, success, failure } from "@/lib/api/http";
import { db } from "@/lib/db/prisma";
import { reserveAdminRequest } from "@/server/imports/service";
import { eventPatchSchema, updateEvent } from "@/server/boosters/events";
export async function PATCH(request: Request, context: {params: Promise<{id: string}>}) {
  try {
    const actor = await requireApiAdmin(); assertSameOrigin(request);
    const {id} = await context.params;
    const patch = await readJson(request, eventPatchSchema);
    await reserveAdminRequest(actor.id);
    return success(await db.$transaction(tx => updateEvent(tx, actor.id, id, patch)));
  } catch (error) {return failure(error);}
}
