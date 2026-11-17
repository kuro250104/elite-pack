"use client";

import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const networkFailure = "Le serveur ne répond pas. Réessayez.";

async function send(url: string, init: RequestInit) {
  const response = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...init.headers } });
  const body = await response.json().catch(() => null) as { error?: { message?: string } } | null;
  return response.ok ? null : body?.error?.message ?? "L’opération a échoué. Réessayez.";
}

/** Price is a whole number of coins; the server validates it again and owns every balance. */
export function ListForSaleForm({ cardInstanceId, cardLabel, suggestedPrice }: { cardInstanceId: string; cardLabel: string; suggestedPrice: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const price = Number(new FormData(event.currentTarget).get("price"));
    if (!Number.isInteger(price) || price < 1) { setError("Indiquez un prix entier d’au moins 1 pièce."); return; }
    setPending(true); setError("");
    try {
      const failure = await send("/api/marketplace/listings", { method: "POST", body: JSON.stringify({ cardInstanceId, price }) });
      if (failure) { setError(failure); return; }
      setOpen(false); router.refresh();
    } catch { setError(networkFailure); } finally { setPending(false); }
  }
  if (!open) return <Button size="sm" variant="outline" onClick={() => setOpen(true)} aria-label={`Mettre ${cardLabel} en vente sur le marché`}>Mettre en vente</Button>;
  const inputId = `price-${cardInstanceId}`;
  return <form onSubmit={submit} className="space-y-2 text-left" aria-label={`Mise en vente de ${cardLabel}`}>
    <label htmlFor={inputId} className="text-xs font-medium">Prix en pièces</label>
    <div className="flex gap-2">
      <Input id={inputId} name="price" type="number" inputMode="numeric" min={1} step={1} required defaultValue={Number(suggestedPrice) > 0 ? suggestedPrice : ""} className="min-w-0" />
      <Button type="submit" size="sm" disabled={pending}>{pending ? "…" : "Valider"}</Button>
      <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>Annuler</Button>
    </div>
    {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
  </form>;
}

export function CancelListingButton({ listingId, cardLabel }: { listingId: string; cardLabel: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  async function cancel() {
    setPending(true); setError("");
    try {
      const failure = await send(`/api/marketplace/listings/${encodeURIComponent(listingId)}`, { method: "DELETE" });
      if (failure) { setError(failure); return; }
      router.refresh();
    } catch { setError(networkFailure); } finally { setPending(false); }
  }
  return <div className="space-y-1 text-center">
    <Button size="sm" variant="outline" onClick={cancel} disabled={pending} aria-label={`Retirer ${cardLabel} du marché`}>{pending ? "Retrait…" : "Retirer du marché"}</Button>
    {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
  </div>;
}

export function BuyListingButton({ listingId, cardLabel, priceLabel }: { listingId: string; cardLabel: string; priceLabel: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  // Reused on retry so an interrupted response cannot debit the purchase twice.
  const key = useRef<string | null>(null);
  async function buy() {
    key.current ??= crypto.randomUUID();
    setPending(true); setError("");
    try {
      const failure = await send(`/api/marketplace/listings/${encodeURIComponent(listingId)}/buy`, { method: "POST", headers: { "Idempotency-Key": key.current } });
      if (failure) { setError(failure); key.current = null; setConfirming(false); return; }
      router.refresh();
    } catch { setError("Le serveur ne répond pas. Réessayez : l’achat ne sera pas débité deux fois."); } finally { setPending(false); }
  }
  return <div className="space-y-2 text-center" aria-live="polite">
    {confirming
      ? <div className="flex flex-wrap justify-center gap-2">
          <Button size="sm" onClick={buy} disabled={pending} aria-label={`Confirmer l’achat de ${cardLabel} pour ${priceLabel}`}>{pending ? "Achat en cours…" : `Confirmer (${priceLabel})`}</Button>
          <Button size="sm" variant="ghost" onClick={() => setConfirming(false)} disabled={pending}>Annuler</Button>
        </div>
      : <Button size="sm" onClick={() => setConfirming(true)} aria-label={`Acheter ${cardLabel} pour ${priceLabel}`}>Acheter</Button>}
    {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
  </div>;
}
