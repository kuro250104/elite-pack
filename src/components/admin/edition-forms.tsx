"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { rarityPresentation, type CardRarity } from "@/components/cards/athlete-card";
import { mutationRequest } from "./api";

const rarities = Object.keys(rarityPresentation) as CardRarity[];
type Edition = { id: string; name: string; rarity: CardRarity; maxSupply: number | null; active: boolean; releaseDate: string; mintedSupply: number };

function useSubmit() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<{ text: string; failed: boolean } | null>(null);
  async function run(action: () => Promise<unknown>, success: string) {
    setPending(true); setMessage(null);
    try { await action(); setMessage({ text: success, failed: false }); router.refresh(); }
    catch (error) { setMessage({ text: error instanceof TypeError ? "Connexion interrompue. Réessayez." : error instanceof Error ? error.message : "Enregistrement impossible.", failed: true }); }
    finally { setPending(false); }
  }
  return { pending, message, run };
}
const Feedback = ({ message }: { message: { text: string; failed: boolean } | null }) =>
  message ? <p role={message.failed ? "alert" : "status"} className={message.failed ? "text-sm text-destructive" : "text-sm text-primary"}>{message.text}</p> : null;

/** Empty supply means unlimited; the server re-validates every rule against minted cards. */
function supplyValue(raw: FormDataEntryValue | null) { const value = String(raw ?? "").trim(); return value === "" ? null : Number(value); }

export function EditionCreateForm({ athletes }: { athletes: { id: string; name: string; sport: string }[] }) {
  const { pending, message, run } = useSubmit();
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (pending) return;
    const form = event.currentTarget;
    const fields = new FormData(form);
    const releaseDate = String(fields.get("releaseDate") ?? "");
    await run(() => mutationRequest("/api/admin/editions", "POST", { athleteId: String(fields.get("athleteId") ?? ""), name: String(fields.get("name") ?? "").trim(),
      rarity: String(fields.get("rarity")), maxSupply: supplyValue(fields.get("maxSupply")), active: fields.get("active") === "on",
      addToBoosters: fields.get("addToBoosters") === "on", ...(releaseDate ? { releaseDate } : {}) }).then(() => form.reset()), "Édition créée.");
  }
  if (!athletes.length) return <p className="text-sm text-muted-foreground">Recherchez un athlète pour lui créer une édition.</p>;
  return <form onSubmit={submit} className="space-y-4 rounded-xl border bg-card p-5" aria-label="Créer une édition">
    <fieldset disabled={pending} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <legend className="sr-only">Nouvelle édition</legend>
      <div className="space-y-1 sm:col-span-2 lg:col-span-1"><label htmlFor="new-athlete" className="text-sm font-medium">Athlète</label>
        <select id="new-athlete" name="athleteId" required className="field-select">{athletes.map((athlete) => <option key={athlete.id} value={athlete.id}>{athlete.name} — {athlete.sport}</option>)}</select></div>
      <div className="space-y-1"><label htmlFor="new-name" className="text-sm font-medium">Nom de l’édition</label><Input id="new-name" name="name" required maxLength={80} /></div>
      <div className="space-y-1"><label htmlFor="new-rarity" className="text-sm font-medium">Rareté</label>
        <select id="new-rarity" name="rarity" className="field-select">{rarities.map((rarity) => <option key={rarity} value={rarity}>{rarityPresentation[rarity].name}</option>)}</select></div>
      <div className="space-y-1"><label htmlFor="new-supply" className="text-sm font-medium">Tirage limité</label><Input id="new-supply" name="maxSupply" inputMode="numeric" placeholder="Vide = illimité" aria-describedby="new-supply-hint" /><p id="new-supply-hint" className="text-xs text-muted-foreground">Une édition limitée numérote ses exemplaires.</p></div>
      <div className="space-y-1"><label htmlFor="new-release" className="text-sm font-medium">Date de sortie</label><Input id="new-release" name="releaseDate" type="date" /></div>
      <div className="flex flex-col justify-end gap-2 text-sm">
        <label className="flex items-center gap-2"><input type="checkbox" name="active" className="size-4 accent-primary" />Active</label>
        <label className="flex items-center gap-2"><input type="checkbox" name="addToBoosters" defaultChecked className="size-4 accent-primary" />Ajouter aux boosters de son sport</label>
      </div>
    </fieldset>
    <Button type="submit" disabled={pending}>{pending ? "Création…" : "Créer l’édition"}</Button>
    <Feedback message={message} />
  </form>;
}

export function EditionForm({ edition }: { edition: Edition }) {
  const { pending, message, run } = useSubmit();
  const minted = edition.mintedSupply > 0;
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (pending) return;
    const fields = new FormData(event.currentTarget);
    await run(() => mutationRequest(`/api/admin/editions/${encodeURIComponent(edition.id)}`, "PATCH", { name: String(fields.get("name") ?? "").trim(),
      ...(minted ? {} : { rarity: String(fields.get("rarity")) }), maxSupply: supplyValue(fields.get("maxSupply")),
      active: fields.get("active") === "on", releaseDate: String(fields.get("releaseDate")) }), "Édition enregistrée.");
  }
  const id = (field: string) => `edition-${field}-${edition.id}`;
  return <form onSubmit={submit} className="space-y-2" aria-label={`Modifier l’édition ${edition.name}`}>
    <fieldset disabled={pending} className="grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-[2fr_1.4fr_1fr_1.3fr_auto_auto]">
      <legend className="sr-only">Édition</legend>
      <div className="space-y-1"><label htmlFor={id("name")} className="text-xs text-muted-foreground">Nom</label><Input id={id("name")} name="name" defaultValue={edition.name} required maxLength={80} /></div>
      <div className="space-y-1"><label htmlFor={id("rarity")} className="text-xs text-muted-foreground">Rareté{minted ? " (verrouillée)" : ""}</label>
        <select id={id("rarity")} name="rarity" defaultValue={edition.rarity} disabled={minted} className="field-select">{rarities.map((rarity) => <option key={rarity} value={rarity}>{rarityPresentation[rarity].name}</option>)}</select></div>
      <div className="space-y-1"><label htmlFor={id("supply")} className="text-xs text-muted-foreground">Tirage</label><Input id={id("supply")} name="maxSupply" inputMode="numeric" defaultValue={edition.maxSupply ?? ""} placeholder="Illimité" /></div>
      <div className="space-y-1"><label htmlFor={id("release")} className="text-xs text-muted-foreground">Sortie</label><Input id={id("release")} name="releaseDate" type="date" defaultValue={edition.releaseDate} required /></div>
      <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" name="active" defaultChecked={edition.active} className="size-4 accent-primary" />Active</label>
      <Button type="submit" variant="outline">{pending ? "…" : "Enregistrer"}</Button>
    </fieldset>
    <Feedback message={message} />
  </form>;
}
