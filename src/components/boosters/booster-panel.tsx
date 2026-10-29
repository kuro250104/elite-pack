"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { PackageOpen } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { AthleteCard, rarityPresentation, type CardView, type CardRarity } from "@/components/cards/athlete-card";

const passiveSchema = z.object({ stock: z.number().int().nonnegative(), maxStock: z.number().int().positive(), intervalSeconds: z.number().int().positive(), nextGenerationAt: z.string().nullable(), serverTime: z.string() });
type PassiveSnapshot = z.infer<typeof passiveSchema>;
export type BoosterPanelInitial = {
  boosterTypeId: string; cardCount: number; sports: { id: string; nameFr: string }[];
  weights: { rarity: CardRarity; weightBasisPoints: number }[]; passive: PassiveSnapshot;
  welcomeAvailable: number; welcomeClaimed: boolean;
};
const cardSchema = z.object({ instanceId: z.string(), editionId: z.string(), athleteId: z.string(), name: z.string(), sport: z.string(), rarity: z.enum(["COMMON", "UNCOMMON", "RARE", "EPIC", "LEGENDARY", "MYTHIC"]), editionName: z.string(), nationality: z.string().nullable(), prestigeScore: z.number(), serialNumber: z.number().nullable(), maxSupply: z.number().nullable(), acquiredAt: z.string() });
const openingSchema = z.object({ data: z.object({ openingId: z.string(), replay: z.boolean(), cards: z.array(cardSchema), source: z.enum(["passive", "welcome"]) }) });
type OpenBody = { boosterTypeId: string; sportId: string; source: "passive" | "welcome" };
class ApiFailure extends Error { constructor(message: string, readonly definitive: boolean) { super(message); } }
async function request(url: string, body?: unknown, key?: string): Promise<unknown> {
  const response = await fetch(url, body === undefined ? { cache: "no-store" } : { method: "POST", headers: { "Content-Type": "application/json", ...(key ? { "Idempotency-Key": key } : {}) }, body: JSON.stringify(body) });
  const payload: unknown = await response.json();
  if (!response.ok) {
    const error = z.object({ error: z.object({ message: z.string() }) }).safeParse(payload);
    throw new ApiFailure(error.success ? error.data.error.message : "L’opération n’a pas abouti. Réessayez.", response.status < 500);
  }
  return payload;
}

export function BoosterPanel({ initial }: { initial: BoosterPanelInitial }) {
  const reducedMotion = useReducedMotion();
  const [passive, setPassive] = useState(initial.passive);
  const [welcomeAvailable, setWelcomeAvailable] = useState(initial.welcomeAvailable);
  const [welcomeClaimed, setWelcomeClaimed] = useState(initial.welcomeClaimed);
  const [sportId, setSportId] = useState(initial.sports[0]?.id ?? "");
  const [pending, setPending] = useState<"welcome" | "open" | null>(null);
  const [cards, setCards] = useState<CardView[]>([]);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [retry, setRetry] = useState<{ body: OpenBody; key: string } | null>(null);
  const flight = useRef(false);
  const polling = useRef(false);
  const welcomeKey = useRef<string | null>(null);
  const sync = useCallback(async () => {
    if (flight.current || polling.current) return;
    polling.current = true;
    try {
      const snapshot = z.object({ data: passiveSchema }).parse(await request("/api/boosters/passive"));
      if (!flight.current) setPassive(snapshot.data);
    } catch { /* Le prochain rafraîchissement réessaiera ; le serveur valide chaque ouverture. */ }
    finally { polling.current = false; }
  }, []);
  useEffect(() => {
    const interval = window.setInterval(() => { if (document.visibilityState === "visible") void sync(); }, 30000);
    const focus = () => { void sync(); };
    window.addEventListener("focus", focus);
    return () => { window.clearInterval(interval); window.removeEventListener("focus", focus); };
  }, [sync]);
  useEffect(() => {
    const receivedAt = performance.now();
    const initialSeconds = passive.nextGenerationAt === null ? null : Math.max(0, Math.ceil((Date.parse(passive.nextGenerationAt) - Date.parse(passive.serverTime)) / 1000));
    let resynced = false;
    const update = () => {
      const seconds = initialSeconds === null ? null : Math.max(0, initialSeconds - Math.floor((performance.now() - receivedAt) / 1000));
      setRemaining(seconds);
      // The countdown is informational: at zero, ask the server for the authoritative stock.
      if (seconds === 0 && !resynced) { resynced = true; void sync(); }
    };
    const tick = window.setInterval(update, 1000);
    return () => window.clearInterval(tick);
  }, [passive, sync]);
  async function claimWelcome() {
    if (flight.current) return;
    flight.current = true; setPending("welcome"); setMessage(""); setFailed(false);
    welcomeKey.current ??= crypto.randomUUID();
    try {
      const result = z.object({ data: z.object({ quantity: z.number().int().nonnegative() }) }).parse(await request("/api/boosters/welcome", {}, welcomeKey.current));
      setWelcomeAvailable(result.data.quantity); setWelcomeClaimed(true); welcomeKey.current = null; setMessage("Vos boosters d’accueil sont disponibles.");
    } catch (error) { setFailed(true); setMessage(error instanceof ApiFailure ? error.message : "La récupération n’a pas abouti. Réessayez."); }
    finally { flight.current = false; setPending(null); void sync(); }
  }
  async function open(source: "passive" | "welcome") {
    if (flight.current) return;
    const current = retry ?? { body: { boosterTypeId: initial.boosterTypeId, sportId, source }, key: crypto.randomUUID() };
    flight.current = true; setPending("open"); setMessage(""); setFailed(false);
    try {
      const result = openingSchema.parse(await request("/api/boosters/open", current.body, current.key));
      setCards(result.data.cards); setRetry(null);
      if (result.data.source === "welcome") setWelcomeAvailable(value => Math.max(0, value - (result.data.replay ? 0 : 1)));
      setMessage("Votre booster est ouvert. Découvrez vos cartes !");
    } catch (error) {
      setFailed(true);
      if (error instanceof ApiFailure && error.definitive) { setRetry(null); setMessage(error.message); }
      else { setRetry(current); setMessage("La réponse a été interrompue. Réessayez pour retrouver le résultat de cette ouverture."); }
    } finally { flight.current = false; setPending(null); void sync(); }
  }
  const countdown = remaining === null ? "Actualisation…" : `${Math.floor(remaining / 60).toString().padStart(2, "0")}:${(remaining % 60).toString().padStart(2, "0")}`;
  return <div className="min-w-0 space-y-8">
    <section aria-label="Vos boosters" className="grid gap-4 sm:grid-cols-2">
      <div className="min-w-0 rounded-xl border bg-card p-5"><h2 className="font-semibold">Boosters gratuits</h2><p className="my-3 text-3xl font-bold">{passive.stock} / {passive.maxStock}</p><p className="text-sm text-muted-foreground">{passive.stock >= passive.maxStock ? "Stock plein" : `Prochain booster : ${countdown}`}</p><p className="mt-2 text-xs text-muted-foreground">Un booster toutes les {(passive.intervalSeconds / 60).toLocaleString("fr-FR")} minutes, même hors ligne. Le décompte est indicatif.</p></div>
      <div className="min-w-0 rounded-xl border bg-card p-5"><h2 className="font-semibold">Boosters d’accueil</h2><p className="my-3 text-3xl font-bold">{welcomeAvailable}</p>{!welcomeClaimed ? <Button onClick={() => void claimWelcome()} disabled={pending !== null || retry !== null} className="h-auto min-h-11 whitespace-normal py-2">{pending === "welcome" ? "Récupération…" : "Récupérer mon booster de bienvenue"}</Button> : <p className="text-sm text-muted-foreground">Votre cadeau de bienvenue a été récupéré.</p>}</div>
    </section>
    <section aria-labelledby="open-title" className="min-w-0 rounded-xl border bg-card p-5 sm:p-6">
      <div className="mb-5 flex items-center gap-4"><div className="flex size-16 shrink-0 items-center justify-center rounded-xl border border-primary/40 bg-secondary"><PackageOpen aria-hidden="true" className="size-8 text-primary" /></div><div><h2 id="open-title" className="text-xl font-semibold">Ouvrir un booster</h2><p className="mt-2 text-sm text-muted-foreground">Choisissez votre sport et découvrez {initial.cardCount} cartes. Les doublons sont possibles.</p></div></div>
      <label htmlFor="booster-sport" className="text-sm font-medium">Choisir un sport</label><select id="booster-sport" value={sportId} onChange={event => setSportId(event.target.value)} disabled={pending !== null || retry !== null || !initial.sports.length} className="mt-2 block min-h-11 w-full min-w-0 rounded-md border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{initial.sports.map(sport => <option key={sport.id} value={sport.id}>{sport.nameFr}</option>)}</select>
      {!initial.sports.length && <p className="mt-3 text-sm text-muted-foreground">Aucun sport disponible pour le moment.</p>}
      <div className="mt-5 flex flex-wrap gap-3">{retry ? <Button onClick={() => void open(retry.body.source)} disabled={pending !== null}>Réessayer l’ouverture</Button> : <><Button onClick={() => void open("welcome")} disabled={pending !== null || !sportId || welcomeAvailable < 1} className="h-auto min-h-11 whitespace-normal py-2">Ouvrir mon booster de bienvenue</Button><Button variant="outline" onClick={() => void open("passive")} disabled={pending !== null || !sportId || passive.stock < 1} className="h-auto min-h-11 whitespace-normal py-2">Ouvrir un booster gratuit</Button></>}</div>
      {pending === "open" && <motion.div role="status" className="mt-5 rounded-lg bg-secondary p-4 text-center" animate={reducedMotion ? { opacity: 1 } : { opacity: [0.55, 1, 0.55] }} transition={reducedMotion ? { duration: 0 } : { duration: 1.2, repeat: Infinity }}>Ouverture du booster…</motion.div>}
      <div aria-live="polite" aria-atomic="true">{message && <p role={failed ? "alert" : "status"} className={`mt-4 text-sm ${failed ? "text-destructive" : "text-primary"}`}>{message}</p>}</div>
      <details className="mt-6"><summary className="min-h-11 cursor-pointer py-3 text-sm text-primary">Probabilités par carte</summary><dl className="grid gap-2 text-sm sm:grid-cols-2">{initial.weights.map(weight => <div key={weight.rarity} className="flex justify-between gap-3"><dt>{rarityPresentation[weight.rarity].name}</dt><dd>{(weight.weightBasisPoints / 100).toLocaleString("fr-FR")} %</dd></div>)}</dl></details>
    </section>
    {cards.length > 0 && <section aria-labelledby="cards-title"><div className="mb-5 flex flex-wrap items-center justify-between gap-3"><h2 id="cards-title" className="text-2xl font-semibold">Vos nouvelles cartes</h2><Link href="/collection" className="text-sm text-primary underline underline-offset-4">Voir ma collection</Link></div><div className="grid items-stretch gap-4 sm:grid-cols-2 lg:grid-cols-3">{cards.map((card, index) => <motion.div key={card.instanceId} initial={reducedMotion ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: reducedMotion ? 0 : 0.25, delay: reducedMotion ? 0 : index * 0.08 }}><AthleteCard card={card} /></motion.div>)}</div></section>}
  </div>;
}
