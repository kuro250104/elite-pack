export async function mutationRequest(url: string, method: "POST" | "PATCH", body: unknown, key?: string): Promise<unknown> {
  const response = await fetch(url, { method, headers: { "Content-Type": "application/json", ...(key ? { "Idempotency-Key": key } : {}) }, body: JSON.stringify(body) });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    if (payload && typeof payload === "object" && "error" in payload) {
      const error = payload.error;
      if (error && typeof error === "object" && "message" in error && typeof error.message === "string") throw new Error(error.message);
    }
    throw new Error("L’opération a échoué. Vérifiez les données et réessayez.");
  }
  return payload;
}
