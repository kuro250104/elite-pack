"use client";
import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { mutationRequest } from "./api";

export function ImportForm({ configured, kind }: { configured: boolean; kind: "sports" | "athlete" }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  const request = useRef<{ body: string; key: string } | null>(null);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (pending || !configured) return;
    const fields = new FormData(event.currentTarget);
    const targetAthleteId = String(fields.get("targetAthleteId") ?? "").trim();
    const body = kind === "sports" ? { kind } : { kind, externalId: String(fields.get("externalId") ?? "").trim(), ...(targetAthleteId ? { targetAthleteId } : {}) };
    const signature = JSON.stringify(body);
    if (request.current?.body !== signature) request.current = { body: signature, key: crypto.randomUUID() };
    setPending(true); setMessage(""); setFailed(false);
    try {
      const result = await mutationRequest("/api/admin/imports", "POST", body, request.current.key);
      request.current = null;
      if (result && typeof result === "object" && "data" in result && result.data && typeof result.data === "object" && "status" in result.data && result.data.status === "FAILED") {
        setFailed(true); setMessage("errorMessage" in result.data && typeof result.data.errorMessage === "string" ? result.data.errorMessage : "L’import a échoué. Consultez l’historique.");
      } else setMessage("Import enregistré. Consultez son résultat dans l’historique.");
      router.refresh();
    } catch (error) {
      setFailed(true); setMessage(error instanceof TypeError ? "Connexion interrompue. Réessayez : la même demande sera conservée pour éviter un import en double." : error instanceof Error ? error.message : "L’import a échoué. Réessayez.");
    } finally { setPending(false); }
  }
  return <form onSubmit={submit} className="space-y-4">
    <fieldset disabled={pending || !configured} className="space-y-4">
      <legend className="mb-2 text-lg font-semibold">{kind === "sports" ? "Importer les sports" : "Importer un athlète par identifiant"}</legend>
      {kind === "sports" ? <p className="text-sm text-muted-foreground">Récupérez le catalogue TheSportsDB. Les nouveaux sports restent désactivés jusqu’à la vérification de leur nom français.</p> : <>
        <div className="space-y-2"><label htmlFor="externalId" className="text-sm">Identifiant TheSportsDB de l’athlète</label><Input id="externalId" name="externalId" inputMode="numeric" pattern="[0-9]+" maxLength={30} required aria-describedby="externalId-help" /><p id="externalId-help" className="text-xs text-muted-foreground">Identifiant numérique du fournisseur, sans URL.</p></div>
        <div className="space-y-2"><label htmlFor="targetAthleteId" className="text-sm">Identifiant interne à associer (facultatif)</label><Input id="targetAthleteId" name="targetAthleteId" aria-describedby="link-help" /><p id="link-help" className="text-xs text-muted-foreground">Associez uniquement la même personne. Vérifiez son identité et son sport avant de saisir l’identifiant interne visible dans le catalogue.</p></div>
      </>}
      <Button type="submit" className="h-auto min-h-11 whitespace-normal py-2">{pending ? "Import en cours…" : kind === "sports" ? "Importer le catalogue sportif" : "Importer cet athlète"}</Button>
    </fieldset>
    {!configured && <p className="text-sm text-muted-foreground">La clé TheSportsDB doit être configurée sur le serveur pour lancer un import.</p>}
    {message && <p role={failed ? "alert" : "status"} className={failed ? "text-sm text-destructive" : "text-sm text-primary"}>{message}</p>}
  </form>;
}
