import { requireApiAdmin, success, failure } from "@/lib/api/http";
import { db } from "@/lib/db/prisma";
import { paginationSchema } from "@/lib/validations/pagination";
import { reserveAdminRequest } from "@/server/imports/service";
export async function GET(request: Request) {
  try {
    const actor = await requireApiAdmin(); await reserveAdminRequest(actor.id);
    const {page, pageSize} = paginationSchema.parse(Object.fromEntries(new URL(request.url).searchParams));
    const [items, total] = await db.$transaction([db.sport.findMany({orderBy: [{nameFr: "asc"}, {id: "asc"}], skip: (page - 1) * pageSize, take: pageSize, include: {_count: {select: {athletes: true}}}}), db.sport.count()]);
    return success({items, total, page, pageSize});
  } catch (error) {return failure(error);}
}
