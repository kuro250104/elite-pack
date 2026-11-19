import { ApiError } from "@/lib/api/errors";
import { failure } from "@/lib/api/http";
import { errorDemoEnabled, errorDemoQuerySchema, triggerDemoError } from "@/server/demo/errors";

export const dynamic = "force-dynamic";

/** Error demonstration: always answers with an error, through the same failure() path as every route. */
export async function GET(request: Request) {
  try {
    if (!errorDemoEnabled()) throw new ApiError("NOT_FOUND", "Cette ressource est introuvable.", 404);
    const { type } = errorDemoQuerySchema.parse(Object.fromEntries(new URL(request.url).searchParams));
    return await triggerDemoError(type);
  } catch (error) {return failure(error);}
}
