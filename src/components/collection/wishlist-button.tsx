"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { apiErrorMessage } from "@/lib/api/client-errors";

export function WishlistButton({ editionId, wishlisted }: { editionId: string; wishlisted: boolean }) {
  const router = useRouter();
  const [updating, setUpdating] = useState(false);
  const [refreshing, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    const fallback = "La liste de souhaits n’a pas pu être mise à jour.";
    setUpdating(true);
    setError(null);
    try {
      const endpoint = "/api/me/wishlist";
      const response = wishlisted
        ? await fetch(`${endpoint}/${encodeURIComponent(editionId)}`, { method: "DELETE" })
        : await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ editionId }),
        });
      if (response.ok) startTransition(() => router.refresh());
      else setError(apiErrorMessage(await response.json().catch(() => null), response.status, fallback));
    } catch {
      setError(fallback);
    } finally {
      setUpdating(false);
    }
  }

  return <div className="space-y-2">
    <Button size="sm" variant="outline" className="h-auto min-h-9 max-w-full whitespace-normal"
      aria-pressed={wishlisted} disabled={updating || refreshing} onClick={toggle}>
      {wishlisted ? "Retirer de ma liste de souhaits" : "Ajouter à ma liste de souhaits"}
    </Button>
    {error && <p role="alert" className="text-sm text-destructive [overflow-wrap:anywhere]">{error}</p>}
  </div>;
}
