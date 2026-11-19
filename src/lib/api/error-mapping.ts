import { z } from "zod";
import { ApiError } from "./errors";

// System and PostgreSQL codes meaning "the database cannot be reached right now".
const unreachableCodes = new Set(["ECONNREFUSED", "ECONNRESET", "ENOTFOUND", "ETIMEDOUT", "EAI_AGAIN", "EHOSTUNREACH",
  "57P01", "57P02", "57P03", "08000", "08001", "08003", "08006", "53300",
  // Prisma: server unreachable, timeout, connection closed, pool timeout.
  "P1001", "P1002", "P1008", "P1017", "P2024"]);

function codesOf(error: unknown): string[] {
  const codes: string[] = [];
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current && typeof current === "object"; depth++) {
    const { code, name, kind } = current as { code?: unknown; name?: unknown; kind?: unknown };
    for (const value of [code, kind]) if (typeof value === "string") codes.push(value);
    if (name === "PrismaClientInitializationError") codes.push("P1001");
    current = (current as { cause?: unknown }).cause;
  }
  return codes;
}

export function isDatabaseUnavailable(error: unknown): boolean {
  return codesOf(error).some((code) => unreachableCodes.has(code) || code === "DatabaseNotReachable" || code === "SocketTimeout");
}

/**
 * Translates any thrown value into the public ApiError contract.
 * Known errors keep a precise HTTP status; anything else becomes a 500 without technical details.
 */
export function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;
  if (error instanceof z.ZodError) return new ApiError("INVALID_INPUT", "Les données saisies sont invalides.", 400);
  if (isDatabaseUnavailable(error)) return new ApiError("SERVICE_UNAVAILABLE", "Le service est temporairement indisponible. Réessayez dans quelques instants.", 503, 5);
  const [code] = codesOf(error);
  switch (code) {
    case "P2002": return new ApiError("CONFLICT", "Cette ressource existe déjà.", 409);
    case "P2025": return new ApiError("NOT_FOUND", "Cette ressource est introuvable.", 404);
    case "P2003": return new ApiError("CONFLICT", "Cette opération dépend d’une ressource absente ou encore utilisée.", 409);
    // Serialization failure or deadlock: another operation won the race, the client may retry.
    case "P2034": case "40001": case "40P01": return new ApiError("CONCURRENT_UPDATE", "Une autre opération est en cours sur ces données. Réessayez.", 409);
    default: return new ApiError("INTERNAL_ERROR", "Le service est temporairement indisponible.", 500);
  }
}
