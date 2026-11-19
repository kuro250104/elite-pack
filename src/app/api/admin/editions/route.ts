import { requireApiAdmin, assertSameOrigin, readJson, success, failure } from "@/lib/api/http";
import { db } from "@/lib/db/prisma";
import { reserveAdminRequest } from "@/server/imports/service";
import { createEdition, editionCreateSchema, listAdminEditions } from "@/server/admin/editions";
export async function GET(request: Request) {
  try {
    const actor = await requireApiAdmin();
    await reserveAdminRequest(actor.id);
    return success(await listAdminEditions(Object.fromEntries(new URL(request.url).searchParams)));
  } catch (error) {return failure(error);}
}
export async function POST(request: Request) {
  try {
    const actor = await requireApiAdmin(); assertSameOrigin(request);
    const input = await readJson(request, editionCreateSchema);
    await reserveAdminRequest(actor.id);
    return success(await db.$transaction(tx => createEdition(tx, actor.id, input)), 201);
  } catch (error) {return failure(error);}
}
