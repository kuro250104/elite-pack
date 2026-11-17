import Link from "next/link";
import { requireAdmin } from "@/lib/auth/authorization";
import { syncOverview } from "@/server/imports/sync";
import { SyncNowForm } from "@/components/admin/economy-forms";

const when = (iso: string) => new Date(iso).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Paris" });

export default async function SyncAdminPage() {
  await requireAdmin();
  const overview = await syncOverview();
  return <main id="contenu" className="mx-auto min-w-0 max-w-5xl space-y-10 px-5 py-12">
    <Link href="/admin" className="text-sm text-primary hover:underline">← Administration</Link>
    <header className="space-y-2"><h1 className="text-3xl font-bold">Synchronisation des athlètes</h1>
      <p className="max-w-3xl text-muted-foreground">Les fiches sont rafraîchies depuis TheSportsDB par petits lots, les plus anciennes d’abord, en respectant le quota gratuit (un appel toutes les 2,1 secondes). Les corrections faites par un administrateur ne sont jamais écrasées, et chaque champ modifié est conservé dans le journal. Une tâche planifiée lance un lot chaque nuit lorsque le déploiement est configuré.</p></header>
    <dl className="grid gap-4 sm:grid-cols-2">
      <div className="rounded-xl border bg-card p-5"><dt className="text-sm text-muted-foreground">Athlètes liés à TheSportsDB</dt><dd className="mt-2 text-2xl font-semibold">{overview.linked.toLocaleString("fr-FR")}</dd></div>
      <div className="rounded-xl border bg-card p-5"><dt className="text-sm text-muted-foreground">Non rafraîchis depuis plus de 24 h</dt><dd className="mt-2 text-2xl font-semibold">{overview.stale.toLocaleString("fr-FR")}</dd></div>
    </dl>
    <section aria-labelledby="now-title" className="space-y-3"><h2 id="now-title" className="text-xl font-semibold">Lancer un lot</h2><SyncNowForm /></section>
    <section aria-labelledby="oldest-title" className="space-y-3"><h2 id="oldest-title" className="text-xl font-semibold">Prochains à rafraîchir</h2>
      {overview.oldest.length === 0 ? <p className="text-sm text-muted-foreground">Aucun athlète lié à TheSportsDB.</p>
        : <ul className="divide-y rounded-xl border bg-card text-sm">{overview.oldest.map((row) => <li key={row.athleteId} className="flex flex-wrap justify-between gap-2 p-3">
            <Link href={`/athletes/${row.athleteId}`} className="hover:underline [overflow-wrap:anywhere]">{row.name}</Link><span className="text-muted-foreground">Dernière synchronisation : {when(row.syncedAt)}</span></li>)}</ul>}
    </section>
    <section aria-labelledby="runs-title" className="space-y-3"><h2 id="runs-title" className="text-xl font-semibold">Derniers lots</h2>
      {overview.runs.length === 0 ? <p className="text-sm text-muted-foreground">Aucune synchronisation enregistrée.</p>
        : <ul className="divide-y rounded-xl border bg-card text-sm">{overview.runs.map((run) => <li key={run.id} className="flex flex-wrap justify-between gap-2 p-3">
            <span>{run.summary.processed} traité{run.summary.processed > 1 ? "s" : ""} · {run.summary.updated} modifié{run.summary.updated > 1 ? "s" : ""} · {run.summary.failed} en échec{run.summary.stoppedByQuota ? " · arrêt sur quota" : ""}</span>
            <span className="text-muted-foreground">{run.actor} · {when(run.createdAt)}</span></li>)}</ul>}
    </section>
  </main>;
}
