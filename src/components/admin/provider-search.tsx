"use client";

import { useState, type FormEvent } from "react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const searchResultSchema = z.object({ data: z.object({
  items: z.array(z.object({
    externalId: z.string(), fullName: z.string(), sportName: z.string().nullish(),
    nationality: z.string().nullish(), birthDate: z.string().nullish(),
  })), exhaustive: z.boolean(),
}) });
type SearchData = z.infer<typeof searchResultSchema>["data"];

export function ProviderSearch({ configured }: { configured: boolean }) {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [results, setResults] = useState<SearchData | null>(null);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (pending || !configured) return;
    const query = String(new FormData(event.currentTarget).get("query") ?? "").trim();
    if (query.length < 2) { setMessage("Saisissez au moins deux caractères."); return; }
    setPending(true); setMessage(""); setResults(null);
    try {
      const response = await fetch(`/api/admin/imports/search?${new URLSearchParams({ query })}`, { cache: "no-store" });
      const payload: unknown = await response.json();
      if (!response.ok) {
        const error = z.object({ error: z.object({ message: z.string() }) }).safeParse(payload);
        throw new Error(error.success ? error.data.error.message : "La recherche a échoué. Réessayez.");
      }
      const parsed = searchResultSchema.safeParse(payload);
      if (!parsed.success) throw new Error("Le fournisseur a renvoyé une réponse inattendue.");
      setResults(parsed.data.data);
    } catch (error) { setMessage(error instanceof TypeError ? "Connexion interrompue. Réessayez." : error instanceof Error ? error.message : "La recherche a échoué."); }
    finally { setPending(false); }
  }
  return <section aria-labelledby="provider-search-title" className="rounded-xl border bg-card p-6">
    <h2 id="provider-search-title" className="mb-2 text-lg font-semibold">Rechercher chez TheSportsDB</h2>
    <p id="provider-search-help" className="mb-4 text-sm text-muted-foreground">Vérifiez l’identité puis recopiez son identifiant dans le formulaire d’import. La recherche ne crée ni n’associe aucun athlète.</p>
    <form onSubmit={submit}>
      <fieldset disabled={pending || !configured} className="flex flex-wrap items-end gap-3">
        <div className="min-w-48 flex-1 space-y-2"><label htmlFor="provider-query" className="text-sm">Nom recherché</label><Input id="provider-query" name="query" minLength={2} maxLength={100} required aria-describedby="provider-search-help" /></div>
        <Button type="submit" variant="outline" className="h-auto min-h-11 whitespace-normal py-2">{pending ? "Recherche en cours…" : "Rechercher dans TheSportsDB"}</Button>
      </fieldset>
    </form>
    {!configured && <p className="mt-3 text-sm text-muted-foreground">La clé TheSportsDB doit être configurée sur le serveur.</p>}
    {message && <p role="alert" className="mt-4 text-sm text-destructive">{message}</p>}
    {results && <div className="mt-5" aria-live="polite">
      <p className="mb-3 text-sm text-muted-foreground">{results.items.length ? `${results.items.length.toLocaleString("fr-FR")} résultat${results.items.length > 1 ? "s" : ""}.` : "Aucun résultat."} {!results.exhaustive && "Le fournisseur ne garantit pas une recherche exhaustive."}</p>
      <ul className="grid gap-3 sm:grid-cols-2">
        {results.items.map(item => <li key={item.externalId} className="rounded-lg border p-4 text-sm">
          <h3 className="font-semibold">{item.fullName}</h3>
          <p className="mt-2">Identifiant TheSportsDB : <strong className="select-all">{item.externalId}</strong></p>
          <p className="mt-1 text-xs text-muted-foreground">Discipline du fournisseur : {item.sportName ?? "Non renseignée"}</p>
          <p className="mt-1 text-xs text-muted-foreground">Nationalité : {item.nationality ?? "Non renseignée"}</p>
          <p className="mt-1 text-xs text-muted-foreground">Date de naissance : {item.birthDate ? new Date(item.birthDate).toLocaleDateString("fr-FR", { timeZone: "UTC" }) : "Non renseignée"}</p>
        </li>)}
      </ul>
    </div>}
  </section>;
}
