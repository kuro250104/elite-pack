import { requireApiAdmin, assertSameOrigin, readJson, success, failure } from "@/lib/api/http";
import { db } from "@/lib/db/prisma";
import { reserveAdminRequest } from "@/server/imports/service";
import { createEvent, eventCreateSchema, listAdminEvents } from "@/server/boosters/events";
export async function GET() {
  try {
    const actor = await requireApiAdmin();
    await reserveAdminRequest(actor.id);
    return success(await listAdminEvents());
  } catch (error) {return failure(error);}
}
export async function POST(request: Request) {
  try {
    const actor = await requireApiAdmin(); assertSameOrigin(request);
    const input = await readJson(request, eventCreateSchema);
    await reserveAdminRequest(actor.id);
    return success(await db.$transaction(tx => createEvent(tx, actor.id, input)), 201);
  } catch (error) {return failure(error);}
}
