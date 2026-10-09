"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { mutationRequest } from "./api";

export type EditableAthlete = {
  id: string; name: string; birthDate: string | null; nationality: string | null;
  currentTeam: string | null; position: string | null; biography: string | null;
  prestigeOverride: number | null; active: boolean;
};

export function AthleteForm({ athlete }: { athlete: EditableAthlete }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (pending) return;
    const fields = new FormData(event.currentTarget);
    const nullable = (key: string) => String(fields.get(key) ?? "").trim() || null;
    const prestigeOverride = nullable("prestigeOverride");
    const candidate = {
      name: String(fields.get("name") ?? "").trim(), birthDate: nullable("birthDate"),
      nationality: nullable("nationality"), currentTeam: nullable("currentTeam"), position: nullable("position"),
      biography: nullable("biography"), prestigeOverride: prestigeOverride === null ? null : Number(prestigeOverride),
      active: fields.get("active") === "on",
    };
    const body = Object.fromEntries(
      Object.entries(candidate).filter(([key, value]) => value !== athlete[key as keyof typeof candidate]),
    );
    if (Object.keys(body).length === 0) {
      setFailed(false); setMessage("Aucune modification à enregistrer."); return;
    }
    setPending(true); setMessage(""); setFailed(false);
    try {
      await mutationRequest(`/api/admin/athletes/${encodeURIComponent(athlete.id)}`, "PATCH", body);
      setMessage("Corrections enregistrées et conservées lors des prochains imports."); router.refresh();
    } catch (error) { setFailed(true); setMessage(error instanceof TypeError ? "Connexion interrompue. Réessayez." : error instanceof Error ? error.message : "Enregistrement impossible."); }
    finally { setPending(false); }
  }
  return <details className="min-w-0">
    <summary className="min-h-11 cursor-pointer py-3 text-primary">Corriger les données</summary>
    <form onSubmit={submit} className="mt-4 min-w-0 space-y-3">
      <fieldset disabled={pending} className="min-w-0 space-y-3">
        <legend className="sr-only">Corrections de {athlete.name}</legend>
        {([
          ["name", "Nom complet", athlete.name, "text", 200],
          ["birthDate", "Date de naissance", athlete.birthDate, "date", undefined],
          ["nationality", "Nationalité", athlete.nationality, "text", 100],
          ["currentTeam", "Équipe actuelle", athlete.currentTeam, "text", 200],
          ["position", "Position", athlete.position, "text", 100],
        ] as const).map(([name, label, value, type, maxLength]) => <div key={name} className="space-y-1"><label htmlFor={`${athlete.id}-${name}`} className="text-xs">{label}</label><Input id={`${athlete.id}-${name}`} name={name} type={type} defaultValue={value ?? ""} required={name === "name"} maxLength={maxLength} /></div>)}
        <div className="space-y-1"><label htmlFor={`${athlete.id}-biography`} className="text-xs">Biographie</label><textarea id={`${athlete.id}-biography`} name="biography" defaultValue={athlete.biography ?? ""} maxLength={20000} rows={4} className="w-full rounded-md border bg-background p-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" /></div>
        <div className="space-y-1"><label htmlFor={`${athlete.id}-prestige`} className="text-xs">Prestige imposé (0 à 100, facultatif)</label><Input id={`${athlete.id}-prestige`} name="prestigeOverride" type="number" min={0} max={100} step={1} defaultValue={athlete.prestigeOverride ?? ""} /></div>
        <label className="flex min-h-11 items-center gap-2"><input type="checkbox" name="active" defaultChecked={athlete.active} className="size-4 accent-primary" />Athlète activé</label>
        <p className="text-xs text-muted-foreground">Seuls les champs modifiés sont enregistrés et deviennent prioritaires sur le fournisseur. Vider un champ facultatif efface sa valeur.</p>
        <Button type="submit" variant="outline" className="h-auto min-h-11 whitespace-normal py-2">{pending ? "Enregistrement…" : "Enregistrer les corrections"}</Button>
      </fieldset>
      {message && <p role={failed ? "alert" : "status"} className={failed ? "text-sm text-destructive" : "text-sm text-primary"}>{message}</p>}
    </form>
  </details>;
}
