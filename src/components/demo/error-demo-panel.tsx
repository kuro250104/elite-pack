"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { apiErrorMessage, type ApiErrorBody } from "@/lib/api/client-errors";

const apiCases = [
  { type: "validation", label: "Données invalides", expected: "400" },
  { type: "non-authentifie", label: "Non connecté", expected: "401" },
  { type: "interdit", label: "Rôle insuffisant", expected: "403" },
  { type: "introuvable", label: "Enregistrement absent (erreur Prisma)", expected: "404" },
  { type: "conflit", label: "Carte déjà vendue", expected: "409" },
  { type: "sql", label: "Requête SQL invalide", expected: "500" },
  { type: "crash", label: "Plantage du code serveur", expected: "500" },
] as const;

type Result = { status: number; shown: string; requestId: string | null; body: ApiErrorBody };

function CrashOnRender(): never {
  throw new Error("Démonstration : plantage JavaScript pendant l’affichage d’un composant.");
}

export function ErrorDemoPanel({ showDebug }: { showDebug: boolean }) {
  const [result, setResult] = useState<Result | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [crash, setCrash] = useState(false);

  async function call(type: string) {
    setPending(type);
    try {
      const response = await fetch(`/api/demo/erreur?type=${type}`, { cache: "no-store" });
      const body = await response.json().catch(() => ({})) as ApiErrorBody;
      setResult({ status: response.status, body, requestId: response.headers.get("x-request-id"),
        shown: apiErrorMessage(body, response.status, "L’opération a échoué. Réessayez.") });
    } catch {
      setResult({ status: 0, body: {}, requestId: null, shown: "Le serveur ne répond pas. Réessayez." });
    } finally { setPending(null); }
  }

  return <div className="space-y-8">
    {crash && <CrashOnRender />}
    <section aria-labelledby="api-title" className="space-y-4 rounded-xl border bg-card p-5">
      <h2 id="api-title" className="text-lg font-semibold">1. Erreurs renvoyées par l’API</h2>
      <div className="flex flex-wrap gap-2">
        {apiCases.map(({ type, label, expected }) =>
          <Button key={type} variant="outline" size="sm" disabled={pending !== null} onClick={() => call(type)}>{label} ({expected})</Button>)}
      </div>
      <div aria-live="polite">
        {result && <div className="space-y-3">
          <p role="alert" className="rounded-md border border-destructive/50 p-3 text-sm text-destructive">{result.shown}</p>
          <dl className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[auto_1fr]">
            <dt className="text-muted-foreground">Statut HTTP</dt><dd>{result.status}</dd>
            <dt className="text-muted-foreground">Code</dt><dd><code>{result.body.error?.code ?? "—"}</code></dd>
            <dt className="text-muted-foreground">En-tête X-Request-Id</dt><dd><code className="[overflow-wrap:anywhere]">{result.requestId ?? "—"}</code></dd>
          </dl>
          <details open={showDebug}>
            <summary className="cursor-pointer text-sm text-primary">Réponse JSON complète{showDebug ? " (avec le détail « debug » du mode développement)" : ""}</summary>
            <pre className="mt-2 max-h-80 overflow-auto rounded-md bg-secondary p-3 text-xs">{JSON.stringify(result.body, null, 2)}</pre>
          </details>
        </div>}
      </div>
    </section>

    <section aria-labelledby="front-title" className="space-y-4 rounded-xl border bg-card p-5">
      <h2 id="front-title" className="text-lg font-semibold">2. Erreurs de l’interface</h2>
      <div className="flex flex-wrap gap-2">
        <Button variant="destructive" size="sm" onClick={() => setCrash(true)}>Plantage JavaScript</Button>
        <Button asChild variant="outline" size="sm"><Link href="/demo/erreurs/crash-serveur">Plantage d’un composant serveur</Link></Button>
        <Button asChild variant="outline" size="sm"><Link href="/page-qui-n-existe-pas">Page inexistante (404)</Link></Button>
      </div>
    </section>

    <section aria-labelledby="infra-title" className="space-y-2 rounded-xl border bg-card p-5 text-sm text-muted-foreground">
      <h2 id="infra-title" className="text-lg font-semibold text-foreground">3. Base de données indisponible</h2>
      <p>Arrêter PostgreSQL (<code>docker compose -p elite-pack-foundation stop postgres</code>), puis ouvrir <Link className="text-primary underline" href="/api/health">/api/health</Link> : réponse 503 sans détail, erreur complète dans les journaux.</p>
    </section>
  </div>;
}
