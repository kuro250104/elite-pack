import Link from "next/link";
import { requireAdmin } from "@/lib/auth/authorization";
import { getEconomySettings, listBoosterSettings, recentAdminChanges } from "@/server/admin/economy";
import { BoosterSettingsForm, EconomyForm, GrantBoostersForm } from "@/components/admin/economy-forms";

export default async function EconomyAdminPage() {
  await requireAdmin();
  const [settings, boosters, changes] = await Promise.all([getEconomySettings(), listBoosterSettings(),
    recentAdminChanges(undefined, ["ECONOMY_UPDATE", "BOOSTER_SETTINGS_UPDATE", "BOOSTER_GRANT"], 20)]);
  return <main id="contenu" className="mx-auto min-w-0 max-w-5xl space-y-10 px-5 py-12">
    <Link href="/admin" className="text-sm text-primary hover:underline">← Administration</Link>
    <header className="space-y-2"><h1 className="text-3xl font-bold">Règles économiques et boosters</h1>
      <p className="max-w-2xl text-muted-foreground">Les montants sont des nombres entiers de pièces. Chaque modification est enregistrée dans l’historique ci-dessous.</p></header>
    <section aria-labelledby="economy-title" className="space-y-4"><h2 id="economy-title" className="text-xl font-semibold">Économie</h2><EconomyForm initial={settings} /></section>
    <section aria-labelledby="boosters-title" className="space-y-4"><h2 id="boosters-title" className="text-xl font-semibold">Boosters : nombre de cartes et probabilités</h2>
      <p className="text-sm text-muted-foreground">Les probabilités affichées aux joueurs sont celles enregistrées ici. Elles doivent totaliser exactement 100 % ; aucune correction automatique n’est faite.</p>
      {boosters.map((booster) => <BoosterSettingsForm key={booster.id} booster={booster} />)}</section>
    <section aria-labelledby="grant-title" className="space-y-4"><h2 id="grant-title" className="text-xl font-semibold">Offrir des boosters</h2>
      <p className="text-sm text-muted-foreground">Ajoute des boosters du catalogue découverte à tous les joueurs inscrits, dans leurs « Boosters offerts » (le stock gratuit reste plafonné à part). Un joueur qui n’a pas encore récupéré son booster de bienvenue le reçoit en plus.</p>
      <GrantBoostersForm /></section>
    <section aria-labelledby="history-title" className="space-y-3"><h2 id="history-title" className="text-xl font-semibold">Historique</h2>
      {changes.length === 0 ? <p className="text-sm text-muted-foreground">Aucune modification enregistrée.</p>
        : <ul className="divide-y rounded-xl border bg-card text-sm">{changes.map((change) => <li key={change.id} className="space-y-1 p-3">
            <p className="flex flex-wrap justify-between gap-2"><span className="font-medium">{change.label}</span><span className="text-muted-foreground">{change.actor} · {new Date(change.createdAt).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Paris" })}</span></p>
            <details className="text-xs text-muted-foreground"><summary className="cursor-pointer">Détail avant / après</summary>
              <pre className="mt-2 overflow-x-auto whitespace-pre-wrap [overflow-wrap:anywhere]">{JSON.stringify({ avant: change.before, après: change.after }, null, 2)}</pre></details>
          </li>)}</ul>}
    </section>
  </main>;
}
