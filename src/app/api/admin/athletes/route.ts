import { z } from "zod";
import { requireApiAdmin, success, failure } from "@/lib/api/http";
import { db } from "@/lib/db/prisma";
import { paginationSchema } from "@/lib/validations/pagination";
import { reserveAdminRequest } from "@/server/imports/service";
export async function GET(request: Request) {
  try {
    const actor = await requireApiAdmin(); await reserveAdminRequest(actor.id);
    const params = Object.fromEntries(new URL(request.url).searchParams);
    const {page, pageSize} = paginationSchema.parse(params);
    const query = z.string().trim().max(120).parse(params.query ?? "");
    const where = query ? {name: {contains: query, mode: "insensitive" as const}} : {};
    const [items, total] = await db.$transaction([db.athlete.findMany({where, orderBy: [{name: "asc"}, {id: "asc"}], skip: (page - 1) * pageSize, take: pageSize, include: {sport: true, externalIds: true}}), db.athlete.count({where})]);
    return success({items, total, page, pageSize});
  } catch (error) {return failure(error);}
}
