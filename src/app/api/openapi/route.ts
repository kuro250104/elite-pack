import { ApiError } from "@/lib/api/errors";
import { failure } from "@/lib/api/http";
import { apiDocsEnabled, buildOpenApiDocument } from "@/server/api-docs/openapi";

export function GET() {
  try {
    if (!apiDocsEnabled()) throw new ApiError("NOT_FOUND", "Cette ressource est introuvable.", 404);
    return Response.json(buildOpenApiDocument(), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {return failure(error);}
}
