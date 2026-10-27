import { requireApiUser, success, failure } from "@/lib/api/http";
import { db } from "@/lib/db/prisma";
import { paginationSchema } from "@/lib/validations/pagination";
import { reserveGameRequest } from "@/server/game/api";
export async function GET(request: Request) { try {
    const actor = await requireApiUser();
    await reserveGameRequest(actor.id);
    const params = paginationSchema.strict().parse(Object.fromEntries(new URL(request.url).searchParams));
    const where = { userId: actor.id };
    const [openings, total] = await Promise.all([db.boosterOpening.findMany({ where, take: params.pageSize, skip: (params.page - 1) * params.pageSize, orderBy: [{ openedAt: "desc" }, { id: "desc" }], select: { id: true, openedAt: true, usedPassiveStock: true, selectedSport: { select: { nameFr: true } }, _count: { select: { cards: true } } } }), db.boosterOpening.count({ where })]);
    return success({ openings, total, ...params });
}
catch (error) {
    return failure(error);
} }
