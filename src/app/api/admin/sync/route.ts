import { z } from "zod";
import { requireApiAdmin, assertSameOrigin, readJson, success, failure } from "@/lib/api/http";
import { reserveAdminRequest } from "@/server/imports/service";
import { syncAthletes, syncOptionsSchema } from "@/server/imports/sync";
// A batch waits 2.1 s between provider calls.
export const maxDuration = 60;
export async function POST(request: Request) {
  try {
    const actor = await requireApiAdmin(); assertSameOrigin(request);
    const input = await readJson(request, z.union([syncOptionsSchema, z.object({}).strict()]));
    await reserveAdminRequest(actor.id);
    return success(await syncAthletes(actor.id, input));
  } catch (error) {return failure(error);}
}
