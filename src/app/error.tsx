"use client";
import { Button } from "@/components/ui/button";

/**
 * Error boundary of every page. In production the message stays generic and only the reference
 * (digest) is shown, to match the server logs; in development the original message helps debugging.
 */
export default function ErrorPage({ error, retry }: { error: unknown; retry: () => void }) {
  const digest = error instanceof Error && "digest" in error && typeof error.digest === "string" ? error.digest : null;
  const detail = process.env.NODE_ENV !== "production" && error instanceof Error ? error.message : null;
  return <main id="contenu" className="mx-auto max-w-lg px-6 py-24">
    <p className="text-sm text-primary">Erreur inattendue</p>
    <h1 className="mt-4 text-3xl font-bold">Une erreur est survenue</h1>
    <p className="my-6 text-muted-foreground">Le service est temporairement indisponible. Vous pouvez réessayer ; si le problème persiste, communiquez la référence ci-dessous.</p>
    {digest && <p className="mb-6 text-sm text-muted-foreground">Référence : <code className="rounded bg-secondary px-1.5 py-0.5">{digest}</code></p>}
    {detail && <pre role="note" aria-label="Détail technique (développement uniquement)" className="mb-6 overflow-x-auto whitespace-pre-wrap rounded-md border border-destructive/50 p-3 text-xs text-destructive">{detail}</pre>}
    <Button onClick={() => retry()}>Réessayer</Button>
  </main>;
}
