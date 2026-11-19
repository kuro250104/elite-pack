/** Error body sent by every API route (see src/lib/api/http.ts and docs/errors.md). */
export type ApiErrorBody = { error?: { code?: string; message?: string; requestId?: string; fields?: Record<string, string> } };

/**
 * Message to show for a failed API call, on the client. Server errors (5xx) carry a short
 * reference: the player can quote it and the developer finds the full error in the logs.
 */
export function apiErrorMessage(payload: unknown, status: number, fallback: string): string {
  const error = payload && typeof payload === "object" && "error" in payload ? (payload as ApiErrorBody).error : undefined;
  const message = typeof error?.message === "string" && error.message ? error.message : fallback;
  return status >= 500 && typeof error?.requestId === "string" ? `${message} (référence ${error.requestId.slice(0, 8)})` : message;
}
