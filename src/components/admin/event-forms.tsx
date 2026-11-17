"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { mutationRequest } from "./api";

type Option = { id: string; label: string };
type EventData = { id: string; nameFr: string; active: boolean; price: number; cardCount: number; maxPerPlayer: number | null; startsAt: string | null;
  endsAt: string | null; sportIds: string[]; editionIds: string[] };

/** datetime-local works in the administrator's browser time zone; the API receives an ISO instant. */
const toLocalInput = (iso: string | null) => { if (!iso) return ""; const date = new Date(iso); return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16); };
const toIso = (value: FormDataEntryValue | null) => new Date(String(value)).toISOString();
const optional = (value: FormDataEntryValue | null) => { const text = String(value ?? "").trim(); return text === "" ? null : text; };

export function EventForm({ event, sports, editions }: { event?: EventData; sports: Option[]; editions: Option[] }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<{ text: string; failed: boolean } | null>(null);
  async function submit(change: FormEvent<HTMLFormElement>) {
    change.preventDefault(); if (pending) return;
    const form = change.currentTarget;
    const fields = new FormData(form);
    const limit = optional(fields.get("maxPerPlayer"));
    const body = { nameFr: String(fields.get("nameFr") ?? "").trim(), startsAt: toIso(fields.get("startsAt")), endsAt: toIso(fields.get("endsAt")),
      price: Number(fields.get("price")), cardCount: Number(fields.get("cardCount")), maxPerPlayer: limit === null ? null : Number(limit),
      sportIds: fields.getAll("sportIds").map(String), editionIds: fields.getAll("editionIds").map(String), ...(event ? { active: fields.get("active") === "on" } : {}) };
    setPending(true); setMessage(null);
    try {
      await mutationRequest(event ? `/api/admin/events/${encodeURIComponent(event.id)}` : "/api/admin/events", event ? "PATCH" : "POST", body);
      setMessage({ text: event ? "Événement enregistré." : "Événement créé, désactivé : vérifiez ses probabilités puis activez-le.", failed: false });
      if (!event) form.reset();
      router.refresh();
    } catch (error) { setMessage({ text: error instanceof TypeError ? "Connexion interrompue. Réessayez." : error instanceof Error ? error.message : "Enregistrement impossible.", failed: true }); }
    finally { setPending(false); }
  }
  const id = (field: string) => `event-${field}-${event?.id ?? "new"}`;
  return <form onSubmit={submit} className="space-y-4 rounded-xl border bg-card p-5" aria-label={event ? `Modifier l’événement ${event.nameFr}` : "Créer un événement"}>
    <fieldset disabled={pending} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <legend className="sr-only">Événement</legend>
      <div className="space-y-1 sm:col-span-2 lg:col-span-1"><label htmlFor={id("name")} className="text-sm font-medium">Nom</label><Input id={id("name")} name="nameFr" defaultValue={event?.nameFr} required maxLength={80} /></div>
      <div className="space-y-1"><label htmlFor={id("start")} className="text-sm font-medium">Début</label><Input id={id("start")} name="startsAt" type="datetime-local" defaultValue={toLocalInput(event?.startsAt ?? null)} required /></div>
      <div className="space-y-1"><label htmlFor={id("end")} className="text-sm font-medium">Fin</label><Input id={id("end")} name="endsAt" type="datetime-local" defaultValue={toLocalInput(event?.endsAt ?? null)} required /></div>
      <div className="space-y-1"><label htmlFor={id("price")} className="text-sm font-medium">Prix (pièces, 0 = gratuit)</label><Input id={id("price")} name="price" type="number" min={0} step={1} defaultValue={event?.price ?? 0} required /></div>
      <div className="space-y-1"><label htmlFor={id("cards")} className="text-sm font-medium">Cartes par booster</label><Input id={id("cards")} name="cardCount" type="number" min={1} max={50} step={1} defaultValue={event?.cardCount ?? 5} required /></div>
      <div className="space-y-1"><label htmlFor={id("limit")} className="text-sm font-medium">Limite par joueur</label><Input id={id("limit")} name="maxPerPlayer" type="number" min={1} step={1} defaultValue={event?.maxPerPlayer ?? ""} placeholder="Vide = illimité" /></div>
      {event && <label className="flex min-h-11 items-center gap-2 self-end text-sm"><input type="checkbox" name="active" defaultChecked={event.active} className="size-4 accent-primary" />Actif (visible des joueurs)</label>}
    </fieldset>
    <fieldset disabled={pending} className="space-y-2"><legend className="text-sm font-medium">Sports de l’événement (aucun = tous les sports actifs)</legend>
      <div className="flex flex-wrap gap-4">{sports.map((sport) => <label key={sport.id} className="flex items-center gap-2 text-sm"><input type="checkbox" name="sportIds" value={sport.id} defaultChecked={event?.sportIds.includes(sport.id)} className="size-4 accent-primary" />{sport.label}</label>)}</div>
    </fieldset>
    <fieldset disabled={pending} className="space-y-2"><legend className="text-sm font-medium">Éditions éligibles (aucune = toutes les éditions actives des sports choisis)</legend>
      <select name="editionIds" multiple size={Math.min(8, Math.max(3, editions.length))} defaultValue={event?.editionIds} aria-label="Éditions éligibles" className="w-full min-w-0 rounded-md border bg-background p-2 text-sm">
        {editions.map((edition) => <option key={edition.id} value={edition.id}>{edition.label}</option>)}</select>
      <p className="text-xs text-muted-foreground">Ctrl ou Cmd + clic pour en choisir plusieurs. Un pool incomplet fait échouer l’ouverture sans consommer le booster.</p>
    </fieldset>
    <Button type="submit" variant={event ? "outline" : "default"} disabled={pending}>{pending ? "Enregistrement…" : event ? "Enregistrer l’événement" : "Créer l’événement"}</Button>
    {message && <p role={message.failed ? "alert" : "status"} className={message.failed ? "text-sm text-destructive" : "text-sm text-primary"}>{message.text}</p>}
  </form>;
}
