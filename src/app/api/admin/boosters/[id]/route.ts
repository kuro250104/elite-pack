import { requireApiAdmin, assertSameOrigin, readJson, success, failure } from "@/lib/api/http";
import { db } from "@/lib/db/prisma";
import { reserveAdminRequest } from "@/server/imports/service";
import { boosterSettingsSchema, updateBoosterSettings } from "@/server/admin/economy";
export async function PATCH(request: Request, context: {params: Promise<{id: string}>}) {
  try {
    const actor = await requireApiAdmin(); assertSameOrigin(request);
    const {id} = await context.params;
    const input = await readJson(request, boosterSettingsSchema);
    await reserveAdminRequest(actor.id);
    return success(await db.$transaction(tx => updateBoosterSettings(tx, actor.id, id, input)));
  } catch (error) {return failure(error);}
}
