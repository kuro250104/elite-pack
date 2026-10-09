import "server-only";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { ApiError } from "./errors";

export async function requireApiAdmin() {
  const session = await auth();
  if (!session?.user?.id) throw new ApiError("UNAUTHENTICATED", "Veuillez vous connecter.", 401);
  if (session.user.role !== "ADMIN") throw new ApiError("FORBIDDEN", "Cette action est réservée aux administrateurs.", 403);
  return session.user;
}
export function assertSameOrigin(request: Request) {
  const expected = new URL(process.env.AUTH_URL || request.url).origin;
  const supplied = request.headers.get("origin");
  if (!supplied || supplied !== expected) throw new ApiError("INVALID_ORIGIN", "L’origine de la requête n’est pas autorisée.", 403);
}
export async function readJson<T>(request: Request, schema: z.ZodType<T>): Promise<T> {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    throw new ApiError("INVALID_CONTENT_TYPE", "Une requête JSON est nécessaire.", 415);
  }
  const reader = request.body?.getReader();
  if (!reader) throw new ApiError("INVALID_INPUT", "Le corps de la requête est vide.", 400);
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const {done, value} = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 64 * 1024) {
        await reader.cancel();
        throw new ApiError("PAYLOAD_TOO_LARGE", "La requête est trop volumineuse.", 413);
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {bytes.set(chunk, offset); offset += chunk.byteLength;}
  let parsed: unknown;
  try { parsed = JSON.parse(new TextDecoder().decode(bytes)); }
  catch { throw new ApiError("INVALID_JSON", "Le contenu JSON est invalide.", 400); }
  return schema.parse(parsed);
}
export function success(data: unknown, status = 200) {
  return Response.json({data}, {status, headers: {"Cache-Control": "no-store"}});
}
export function failure(error: unknown) {
  const safe = error instanceof ApiError ? error : error instanceof z.ZodError
    ? new ApiError("INVALID_INPUT", "Les données saisies sont invalides.", 400)
    : new ApiError("INTERNAL_ERROR", "Le service est temporairement indisponible.", 500);
  const headers: Record<string, string> = {"Cache-Control": "no-store"};
  if (safe.retryAfter !== undefined) headers["Retry-After"] = String(safe.retryAfter);
  return Response.json({error: {code: safe.code, message: safe.message}}, {status: safe.status, headers});
}
