"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, Sparkles } from "lucide-react";
import { AthleteCard, rarityPresentation, type CardRarity, type CardView } from "@/components/cards/athlete-card";
import { Button } from "@/components/ui/button";

type EventView = {
  id: string; nameFr: string; price: string; cardCount: number; maxPerPlayer: number | null; startsAt: string | null; endsAt: string | null;
  status: "upcoming" | "ongoing"; season: string | null; competition: string | null; sports: { id: string; nameFr: string }[];
  weights: Record<CardRarity, number>; purchased: number; available: number;
};

async function post(url: string, body: unknown, key: string) {
  const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": key }, body: JSON.stringify(body) });
  const payload = await response.json().catch(() => null) as { data?: unknown; error?: { message?: string } } | null;
  if (!response.ok) throw new Error(payload?.error?.message ?? "L’opération a échoué. Réessayez.");
  return payload?.data;
}

/** Informational countdown driven by the server clock offset; the server alone decides availability. */
function useCountdown(target: string | null, serverOffsetMs: number) {
  const [now, setNow] = useState(() => Date.now() + serverOffsetMs);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now() + serverOffsetMs), 1000); return () => clearInterval(timer); }, [serverOffsetMs]);
  if (!target) return null;
  const seconds = Math.max(0, Math.floor((new Date(target).getTime() - now) / 1000));
  const days = Math.floor(seconds / 86400), hours = Math.floor((seconds % 86400) / 3600), minutes = Math.floor((seconds % 3600) / 60);
  return days > 0 ? `${days} j ${hours} h` : `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

function EventCard({ event, serverOffsetMs }: { event: EventView; serverOffsetMs: number }) {
  const router = useRouter();
  const [sportId, setSportId] = useState(event.sports.length === 1 ? event.sports[0]!.id : "");
  const [pending, setPending] = useState<"buy" | "open" | null>(null);
  const [message, setMessage] = useState<{ text: string; failed: boolean } | null>(null);
  const [cards, setCards] = useState<CardView[]>([]);
  // Keys are kept until success so a retried request is never charged or opened twice.
  const buyKey = useRef<string | null>(null);
  const openKey = useRef<string | null>(null);
  const countdown = useCountdown(event.status === "upcoming" ? event.startsAt : event.endsAt, serverOffsetMs);
  const price = Number(event.price);
  const limitReached = event.maxPerPlayer !== null && event.purchased >= event.maxPerPlayer;
  async function buy() {
    buyKey.current ??= crypto.randomUUID(); setPending("buy"); setMessage(null);
    try { await post(`/api/boosters/events/${encodeURIComponent(event.id)}/purchase`, {}, buyKey.current); buyKey.current = null;
      setMessage({ text: price > 0 ? "Booster acheté." : "Booster récupéré.", failed: false }); router.refresh(); }
    catch (error) { setMessage({ text: error instanceof TypeError ? "Connexion interrompue : réessayez, le booster ne sera pas facturé deux fois." : (error as Error).message, failed: true }); }
    finally { setPending(null); }
  }
  async function open() {
    openKey.current ??= crypto.randomUUID(); setPending("open"); setMessage(null);
    try {
      const result = await post("/api/boosters/open", { boosterTypeId: event.id, source: "inventory", ...(sportId ? { sportId } : {}) }, openKey.current) as { cards: CardView[] };
      openKey.current = null; setCards(result.cards); router.refresh();
    } catch (error) { setMessage({ text: error instanceof TypeError ? "Connexion interrompue : réessayez, aucune carte ne sera tirée deux fois." : (error as Error).message, failed: true }); }
    finally { setPending(null); }
  }
  return <article className="space-y-4 rounded-xl border border-rarity-legendary/60 bg-gradient-to-br from-rarity-legendary/10 via-card to-card p-5" aria-labelledby={`event-${event.id}`}>
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0"><p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-rarity-legendary"><Sparkles className="size-4" aria-hidden="true" />Événement</p>
        <h3 id={`event-${event.id}`} className="mt-1 text-xl font-bold [overflow-wrap:anywhere]">{event.nameFr}</h3>
        <p className="text-sm text-muted-foreground">{[event.competition, event.season, event.sports.map((sport) => sport.nameFr).join(", ")].filter(Boolean).join(" · ")}</p></div>
      {countdown && <p className="flex items-center gap-2 text-sm" aria-live="off"><CalendarClock className="size-4" aria-hidden="true" />{event.status === "upcoming" ? "Commence dans" : "Se termine dans"} <span className="font-semibold tabular-nums">{countdown}</span></p>}
    </div>
    <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
      <div><dt className="text-muted-foreground">Prix</dt><dd className="font-semibold">{price > 0 ? `${price.toLocaleString("fr-FR")} pièce${price > 1 ? "s" : ""}` : "Gratuit"}</dd></div>
      <div><dt className="text-muted-foreground">Cartes</dt><dd className="font-semibold">{event.cardCount}</dd></div>
      <div><dt className="text-muted-foreground">Limite</dt><dd className="font-semibold">{event.maxPerPlayer === null ? "Aucune" : `${event.purchased} / ${event.maxPerPlayer}`}</dd></div>
      <div><dt className="text-muted-foreground">À ouvrir</dt><dd className="font-semibold">{event.available}</dd></div>
    </dl>
    <p className="text-xs text-muted-foreground">Probabilités : {(Object.keys(rarityPresentation) as CardRarity[]).filter((rarity) => event.weights[rarity] > 0)
      .map((rarity) => `${rarityPresentation[rarity].name} ${(event.weights[rarity] / 100).toLocaleString("fr-FR")} %`).join(" · ")}</p>
    {event.status === "ongoing" && <div className="flex flex-wrap items-end gap-3">
      {event.sports.length > 1 && <div className="min-w-48 space-y-1"><label htmlFor={`event-sport-${event.id}`} className="text-sm">Sport (facultatif)</label>
        <select id={`event-sport-${event.id}`} value={sportId} onChange={(change) => setSportId(change.target.value)} className="field-select"><option value="">Tous les sports de l’événement</option>{event.sports.map((sport) => <option key={sport.id} value={sport.id}>{sport.nameFr}</option>)}</select></div>}
      <Button onClick={() => void buy()} disabled={pending !== null || limitReached} variant="outline">{pending === "buy" ? "…" : limitReached ? "Limite atteinte" : price > 0 ? `Acheter (${price.toLocaleString("fr-FR")} pièce${price > 1 ? "s" : ""})` : "Récupérer gratuitement"}</Button>
      <Button onClick={() => void open()} disabled={pending !== null || event.available < 1}>{pending === "open" ? "Ouverture…" : "Ouvrir un booster de l’événement"}</Button>
    </div>}
    {message && <p role={message.failed ? "alert" : "status"} className={message.failed ? "text-sm text-destructive" : "text-sm text-primary"}>{message.text}</p>}
    {cards.length > 0 && <section aria-label={`Cartes obtenues : ${event.nameFr}`} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{cards.map((card) => <AthleteCard key={card.instanceId} card={card} />)}</section>}
  </article>;
}

export function EventBoosters({ events, serverTime }: { events: EventView[]; serverTime: string }) {
  // Offset computed once from the server clock sent with the page.
  const [serverOffsetMs] = useState(() => new Date(serverTime).getTime() - Date.now());
  if (!events.length) return null;
  return <section aria-labelledby="events-title" className="space-y-4">
    <h2 id="events-title" className="text-2xl font-bold">Événements</h2>
    {events.map((event) => <EventCard key={event.id} event={event} serverOffsetMs={serverOffsetMs} />)}
  </section>;
}
