import { apiErrorMessage } from "@/lib/api/client-errors";
export async function mutationRequest(url: string, method: "POST" | "PATCH", body: unknown, key?: string): Promise<unknown> {
  const response = await fetch(url, { method, headers: { "Content-Type": "application/json", ...(key ? { "Idempotency-Key": key } : {}) }, body: JSON.stringify(body) });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new Error(apiErrorMessage(payload, response.status, "L’opération a échoué. Vérifiez les données et réessayez."));
  return payload;
}
