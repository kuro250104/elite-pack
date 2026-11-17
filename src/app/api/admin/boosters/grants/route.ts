import { requireApiAdmin, assertSameOrigin, readJson, success, failure } from "@/lib/api/http";
import { db } from "@/lib/db/prisma";
import { reserveAdminRequest } from "@/server/imports/service";
import { boosterGrantSchema, grantBoostersToAll } from "@/server/admin/grants";
export async function POST(request: Request) {
  try {
    const actor = await requireApiAdmin(); assertSameOrigin(request);
    const input = await readJson(request, boosterGrantSchema);
    await reserveAdminRequest(actor.id);
    return success(await db.$transaction(tx => grantBoostersToAll(tx, actor.id, input, request.headers.get("Idempotency-Key") ?? ""), {timeout: 30_000}));
  } catch (error) {return failure(error);}
}
