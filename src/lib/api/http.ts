import "server-only";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { logger, redact, serializeError } from "@/lib/logger";
import { ApiError } from "./errors";
import { toApiError } from "./error-mapping";

export async function requireApiUser() {
  const session = await auth();
  if (!session?.user?.id) throw new ApiError("UNAUTHENTICATED", "Veuillez vous connecter.", 401);
  return session.user;
}
export async function requireApiAdmin() {
  const session = await auth();
  if (!session?.user?.id) throw new ApiError("UNAUTHENTICATED", "Veuillez vous connecter.", 401);
  if (session.user.role !== "ADMIN") throw new ApiError("FORBIDDEN", "Cette action est réservée aux administrateurs.", 403);
  return session.user;
}
export function assertSameOrigin(request: Request) {
  // The configured public URL and the address actually served (127.0.0.1, LAN, other port) are both same-origin.
  const allowed = new Set([new URL(request.url).origin]);
  if (process.env.AUTH_URL) allowed.add(new URL(process.env.AUTH_URL).origin);
  const supplied = request.headers.get("origin");
  if (!supplied || !allowed.has(supplied)) throw new ApiError("INVALID_ORIGIN", "L’origine de la requête n’est pas autorisée.", 403);
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
/** `npm run dev` only: the original error, to debug from the browser or Swagger UI. Never sent in production or tests. */
function debugDetails(error: unknown) {
  if (process.env.NODE_ENV !== "development" || error instanceof ApiError) return undefined;
  const details = serializeError(error);
  return {name: details.name, message: redact(String(details.message)), ...(details.code !== undefined ? {code: details.code} : {}),
    ...(typeof details.stack === "string" ? {stack: redact(details.stack).split("\n").slice(0, 6)} : {})};
}

/**
 * Single exit point for API errors: stable code, French message, request identifier
 * (X-Request-Id header and body) and log entry. 5xx are logged with the full original error;
 * expected refusals (4xx) only with their code.
 */
export function failure(error: unknown, options: {unexpectedStatus?: 500 | 503} = {}) {
  let safe = toApiError(error);
  if (safe.status === 500 && options.unexpectedStatus === 503) {
    safe = new ApiError("SERVICE_UNAVAILABLE", "Le service est temporairement indisponible. Réessayez dans quelques instants.", 503, 5);
  }
  const requestId = globalThis.crypto.randomUUID();
  if (safe.status >= 500) logger.error("Erreur serveur", {requestId, status: safe.status, code: safe.code, error: serializeError(error)});
  else logger.info("Requête refusée", {requestId, status: safe.status, code: safe.code});
  const headers: Record<string, string> = {"Cache-Control": "no-store", "X-Request-Id": requestId};
  if (safe.retryAfter !== undefined) headers["Retry-After"] = String(safe.retryAfter);
  const debug = debugDetails(error);
  return Response.json({error: {code: safe.code, message: safe.message, requestId, ...(safe.fields ? {fields: safe.fields} : {}),
    ...(debug ? {debug} : {})}}, {status: safe.status, headers});
}
