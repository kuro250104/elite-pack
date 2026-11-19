"use client";
import "./globals.css";

/**
 * Last-resort boundary: replaces the root layout when it crashes, so it renders its own document
 * and applies the dark theme itself. Same rules as error.tsx: reference in production, detail in development.
 */
export default function GlobalError({ error, retry }: { error: unknown; retry: () => void }) {
  const digest = error instanceof Error && "digest" in error && typeof error.digest === "string" ? error.digest : null;
  const detail = process.env.NODE_ENV !== "production" && error instanceof Error ? error.message : null;
  return <html lang="fr" className="dark">
    <body className="min-h-screen bg-background text-foreground antialiased">
      <title>Erreur | Elite Pack</title>
      <main id="contenu" className="mx-auto max-w-lg px-6 py-24">
        <p className="text-sm text-primary">Erreur inattendue</p>
        <h1 className="mt-4 text-3xl font-bold">Elite Pack est momentanément indisponible</h1>
        <p className="my-6 text-muted-foreground">Une erreur empêche l’affichage du site. Réessayez dans quelques instants ; si le problème persiste, communiquez la référence ci-dessous.</p>
        {digest && <p className="mb-6 text-sm text-muted-foreground">Référence : <code className="rounded bg-secondary px-1.5 py-0.5">{digest}</code></p>}
        {detail && <pre role="note" aria-label="Détail technique (développement uniquement)" className="mb-6 overflow-x-auto whitespace-pre-wrap rounded-md border border-destructive/50 p-3 text-xs text-destructive">{detail}</pre>}
        <button type="button" onClick={() => retry()} className="inline-flex h-11 items-center rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground">Réessayer</button>
      </main>
    </body>
  </html>;
}
