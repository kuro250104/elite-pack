import { z } from "zod";
import { requireApiAdmin, success, failure } from "@/lib/api/http";
import { configuredProvider, reserveAdminRequest, reserveProviderRequest } from "@/server/imports/service";
export const runtime = "nodejs";
export async function GET(request: Request) {
  try {
    const actor = await requireApiAdmin();
    const query = z.string().trim().min(2).max(120).parse(new URL(request.url).searchParams.get("query"));
    await reserveAdminRequest(actor.id);
    const provider = configuredProvider();
    await reserveProviderRequest();
    const athletes = await provider.searchAthletes(query);
    return success({items: athletes.map(({externalId, fullName, sportName, nationality, birthDate}) => ({externalId, fullName, sportName, nationality, birthDate})), exhaustive: false});
  } catch (error) {return failure(error);}
}
