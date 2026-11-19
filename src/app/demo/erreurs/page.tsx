import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ErrorDemoPanel } from "@/components/demo/error-demo-panel";
import { errorDemoEnabled } from "@/server/demo/errors";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Démonstration des erreurs", robots: { index: false } };

export default function ErrorDemoPage() {
  if (!errorDemoEnabled()) notFound();
  const production = process.env.NODE_ENV === "production";
  return <main id="contenu" className="mx-auto max-w-3xl space-y-8 px-6 py-12">
    <header className="space-y-3">
      <p className="text-sm text-primary">Outil de démonstration — {production ? "mode production" : "mode développement"}</p>
      <h1 className="text-3xl font-bold">Gestion des erreurs</h1>
      <p className="text-muted-foreground">Chaque bouton déclenche une vraie erreur et montre ce que voit le joueur. Les journaux du serveur affichent la même référence. {production
        ? "En production, aucun détail technique n’est renvoyé."
        : "En développement, la réponse contient aussi le détail technique (champ « debug »)."} Voir <code>docs/errors.md</code>.</p>
    </header>
    <ErrorDemoPanel showDebug={!production} />
  </main>;
}
