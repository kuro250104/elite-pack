import { requireApiAdmin, assertSameOrigin, readJson, success, failure } from "@/lib/api/http";
import { db } from "@/lib/db/prisma";
import { reserveAdminRequest } from "@/server/imports/service";
import { economySettingsSchema, getEconomySettings, updateEconomySettings } from "@/server/admin/economy";
export async function GET() {
  try {
    const actor = await requireApiAdmin();
    await reserveAdminRequest(actor.id);
    return success(await getEconomySettings());
  } catch (error) {return failure(error);}
}
export async function PATCH(request: Request) {
  try {
    const actor = await requireApiAdmin(); assertSameOrigin(request);
    const input = await readJson(request, economySettingsSchema);
    await reserveAdminRequest(actor.id);
    return success(await db.$transaction(tx => updateEconomySettings(tx, actor.id, input), {timeout: 15_000}));
  } catch (error) {return failure(error);}
}
