"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

/** Two-step confirmation; the server recomputes the price and the client never sends an amount. */
export function SellToBankButton({ cardInstanceId, cardLabel, priceLabel }: { cardInstanceId: string; cardLabel: string; priceLabel: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  // Reused on retry so an interrupted response cannot credit the sale twice.
  const key = useRef<string | null>(null);
  async function sell() {
    key.current ??= crypto.randomUUID();
    setPending(true); setMessage("");
    try {
      const response = await fetch("/api/bank/sales", { method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": key.current }, body: JSON.stringify({ cardInstanceId }) });
      const body = await response.json().catch(() => null) as { error?: { message?: string } } | null;
      if (!response.ok) { setMessage(body?.error?.message ?? "La vente a échoué. Réessayez."); key.current = null; setConfirming(false); return; }
      router.refresh();
    } catch { setMessage("Le serveur ne répond pas. Réessayez : la vente ne sera pas comptée deux fois."); }
    finally { setPending(false); }
  }
  return <div className="space-y-2 text-center" aria-live="polite">
    {confirming
      ? <div className="flex flex-wrap justify-center gap-2">
          <Button size="sm" variant="destructive" onClick={sell} disabled={pending} aria-label={`Confirmer la revente de ${cardLabel} pour ${priceLabel}`}>{pending ? "Vente en cours…" : `Confirmer (${priceLabel})`}</Button>
          <Button size="sm" variant="ghost" onClick={() => setConfirming(false)} disabled={pending}>Annuler</Button>
        </div>
      : <Button size="sm" variant="outline" onClick={() => setConfirming(true)} aria-label={`Revendre ${cardLabel} à la banque pour ${priceLabel}`}>Revendre à la banque</Button>}
    {message && <p role="alert" className="text-xs text-destructive">{message}</p>}
  </div>;
}
