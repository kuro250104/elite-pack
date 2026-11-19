import { requireApiAdmin, success, failure } from "@/lib/api/http";
import { reserveAdminRequest } from "@/server/imports/service";
import { getAdminStats } from "@/server/admin/stats";
export async function GET() {
  try {
    const actor = await requireApiAdmin();
    await reserveAdminRequest(actor.id);
    return success(await getAdminStats());
  } catch (error) {return failure(error);}
}
