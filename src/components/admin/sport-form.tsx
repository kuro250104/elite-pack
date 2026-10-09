"use client";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { mutationRequest } from "./api";
export function SportForm({ sport }: { sport: { id: string; nameFr: string; active: boolean } }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (pending) return;
    const fields = new FormData(event.currentTarget);
    setPending(true); setMessage(""); setFailed(false);
    try {
      await mutationRequest(`/api/admin/sports/${encodeURIComponent(sport.id)}`, "PATCH", { nameFr: String(fields.get("nameFr") ?? "").trim(), active: fields.get("active") === "on" });
      setMessage("Sport enregistré."); router.refresh();
    } catch (error) { setFailed(true); setMessage(error instanceof TypeError ? "Connexion interrompue. Réessayez." : error instanceof Error ? error.message : "Enregistrement impossible."); }
    finally { setPending(false); }
  }
  return <form onSubmit={submit} className="min-w-0 space-y-3">
    <fieldset disabled={pending} className="flex min-w-0 flex-wrap items-end gap-3">
      <div className="min-w-48 flex-1 space-y-1"><label htmlFor={`name-${sport.id}`} className="text-xs text-muted-foreground">Nom français</label><Input id={`name-${sport.id}`} name="nameFr" defaultValue={sport.nameFr} required maxLength={100} /></div>
      <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" name="active" defaultChecked={sport.active} className="size-4 accent-primary" />Activé</label>
      <Button type="submit" variant="outline">{pending ? "Enregistrement…" : "Enregistrer"}</Button>
    </fieldset>
    {message && <p role={failed ? "alert" : "status"} className={failed ? "text-sm text-destructive" : "text-sm text-primary"}>{message}</p>}
  </form>;
}
