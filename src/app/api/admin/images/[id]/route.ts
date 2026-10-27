import { requireApiAdmin, assertSameOrigin, readJson, success, failure } from "@/lib/api/http";
import { db } from "@/lib/db/prisma";
import { reserveAdminRequest } from "@/server/imports/service";
import { imageReviewCommandSchema } from "@/server/images/validation";
import { reviewAthleteImage } from "@/server/images/service";
export async function PATCH(request: Request, context: {params: Promise<{id: string}>}) {
  try {
    const actor = await requireApiAdmin(); assertSameOrigin(request);
    const {id} = await context.params;
    const command = await readJson(request, imageReviewCommandSchema);
    await reserveAdminRequest(actor.id);
    return success(await db.$transaction(tx => reviewAthleteImage(tx, id, command, actor.id)));
  } catch (error) {return failure(error);}
}
