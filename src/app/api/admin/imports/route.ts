import { requireApiAdmin, assertSameOrigin, readJson, success, failure } from "@/lib/api/http";
import { db } from "@/lib/db/prisma";
import { paginationSchema } from "@/lib/validations/pagination";
import { importCommandSchema, idempotencyKeySchema } from "@/server/imports/validation";
import { reserveAdminRequest, runImport } from "@/server/imports/service";
export const runtime = "nodejs";
export const maxDuration = 30;
export async function GET(request: Request) {
  try {
    const actor = await requireApiAdmin();
    await reserveAdminRequest(actor.id);
    const {page, pageSize} = paginationSchema.parse(Object.fromEntries(new URL(request.url).searchParams));
    const [items, total] = await db.$transaction([
      db.importJob.findMany({orderBy: [{createdAt: "desc"}, {id: "desc"}], skip: (page - 1) * pageSize, take: pageSize}),
      db.importJob.count(),
    ]);
    return success({items, total, page, pageSize});
  } catch (error) {return failure(error);}
}
export async function POST(request: Request) {
  try {
    const actor = await requireApiAdmin();
    assertSameOrigin(request);
    const key = idempotencyKeySchema.parse(request.headers.get("idempotency-key"));
    const command = await readJson(request, importCommandSchema);
    await reserveAdminRequest(actor.id);
    const {job, replay} = await runImport(actor.id, key, command);
    return success(job, replay ? 200 : 201);
  } catch (error) {return failure(error);}
}
