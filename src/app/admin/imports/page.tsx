import Link from "next/link";
import { requireAdmin } from "@/lib/auth/authorization";
import { db } from "@/lib/db/prisma";
import { ProviderSearch } from "@/components/admin/provider-search";
import { ImportForm } from "@/components/admin/import-form";
import { AthleteForm } from "@/components/admin/athlete-form";
import { SportForm } from "@/components/admin/sport-form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

type Params = Record<string, string | string[] | undefined>;
function pageNumber(value: string | string[] | undefined) { const number = Number(value); return Number.isInteger(number) && number > 0 ? Math.min(number, 10000) : 1; }
const statuses = { PENDING: "En attente", RUNNING: "En cours", COMPLETED: "Terminé", FAILED: "Échec" };
const pageSize = 24;

export default async function ImportsPage({ searchParams }: { searchParams: Promise<Params> }) {
  await requireAdmin();
  const params = await searchParams;
  const jobsPage = pageNumber(params.jobsPage), sportsPage = pageNumber(params.sportsPage), page = pageNumber(params.page);
  const query = typeof params.query === "string" ? params.query.trim().slice(0, 100) : "";
  const where = query ? { name: { contains: query, mode: "insensitive" as const } } : {};
  const [jobs, jobsCount, sports, sportsCount, athletes, athletesCount] = await Promise.all([
    db.importJob.findMany({ orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: pageSize, skip: (jobsPage - 1) * pageSize }), db.importJob.count(),
    db.sport.findMany({ orderBy: [{ nameFr: "asc" }, { id: "asc" }], take: pageSize, skip: (sportsPage - 1) * pageSize, include: { _count: { select: { athletes: true } } } }), db.sport.count(),
    db.athlete.findMany({ where, orderBy: [{ name: "asc" }, { id: "asc" }], take: pageSize, skip: (page - 1) * pageSize, include: { sport: true, externalIds: true } }), db.athlete.count({ where }),
  ]);
  function href(key: string, value: number, anchor: string) {
    const result = new URLSearchParams();
    for (const name of ["jobsPage", "sportsPage", "page", "query"]) { const item = params[name]; if (typeof item === "string") result.set(name, item); }
    result.set(key, String(value)); return `/admin/imports?${result.toString()}#${anchor}`;
  }
  function pagination(key: string, current: number, count: number, anchor: string) {
    return <nav aria-label={`Pagination ${anchor}`} className="mt-4 flex flex-wrap items-center gap-4 text-sm">
      {current > 1 && <Link href={href(key, current - 1, anchor)} className="text-primary hover:underline">Page précédente</Link>}
      <span className="text-muted-foreground">Page {current.toLocaleString("fr-FR")} · {count.toLocaleString("fr-FR")} résultat{count > 1 ? "s" : ""}</span>
      {current * pageSize < count && <Link href={href(key, current + 1, anchor)} className="text-primary hover:underline">Page suivante</Link>}
    </nav>;
  }
  return <main id="contenu" className="mx-auto min-w-0 max-w-6xl space-y-12 px-5 py-12 sm:px-8">
    <header className="space-y-4"><nav aria-label="Administration" className="flex flex-wrap gap-4 text-sm text-primary"><Link href="/admin">Administration</Link><a href="#historique">Historique</a><a href="#sports">Sports</a><a href="#athletes">Athlètes</a></nav><h1 className="text-3xl font-bold">Imports et catalogue sportif</h1><p className="max-w-3xl text-muted-foreground">Importez les données depuis TheSportsDB, vérifiez les traductions et corrigez les identités. Aucune photo n’est affichée sans validation de ses droits d’utilisation.</p></header>
    <section aria-label="Lancer un import" className="grid items-start gap-6 md:grid-cols-2">
      <div className="min-w-0 rounded-xl border bg-card p-6"><ImportForm configured={Boolean(process.env.THESPORTSDB_API_KEY)} kind="sports" /></div>
      <div className="min-w-0 rounded-xl border bg-card p-6"><ImportForm configured={Boolean(process.env.THESPORTSDB_API_KEY)} kind="athlete" /></div>
    </section>
    <ProviderSearch configured={Boolean(process.env.THESPORTSDB_API_KEY)} />
    <section id="historique" aria-labelledby="jobs-title"><h2 id="jobs-title" className="mb-4 text-2xl font-semibold">Historique des imports</h2>
      <div className="overflow-x-auto rounded-xl border"><table className="w-full text-left text-sm"><caption className="sr-only">Imports TheSportsDB, état et résultat</caption><thead className="bg-secondary"><tr><th className="p-4" scope="col">Date</th><th className="p-4" scope="col">État</th><th className="p-4" scope="col">Éléments traités</th><th className="p-4" scope="col">Détail</th></tr></thead><tbody>{jobs.map(job => <tr key={job.id} className="border-t"><td className="p-4 whitespace-nowrap">{job.createdAt.toLocaleString("fr-FR", { timeZone: "Europe/Paris" })}</td><td className="p-4">{statuses[job.status]}</td><td className="p-4">{job.processedCount.toLocaleString("fr-FR")}</td><td className="max-w-md p-4 break-words">{job.errorMessage ?? "—"}<span className="mt-1 block text-xs text-muted-foreground">Identifiant : {job.id}</span></td></tr>)}{!jobs.length && <tr><td colSpan={4} className="p-6 text-muted-foreground">Aucun import enregistré.</td></tr>}</tbody></table></div>
      {pagination("jobsPage", jobsPage, jobsCount, "historique")}
    </section>
    <section id="sports" aria-labelledby="sports-title"><h2 id="sports-title" className="mb-4 text-2xl font-semibold">Sports et traductions</h2><p className="mb-4 text-sm text-muted-foreground">Vérifiez le nom français avant d’activer un sport. L’activation ne crée pas automatiquement d’éditions ou de boosters.</p>
      <div className="space-y-4">{sports.map(sport => <article key={sport.id} className="min-w-0 rounded-xl border bg-card p-5"><h3 className="mb-1 min-w-0 font-semibold [overflow-wrap:anywhere]">{sport.nameFr}</h3><p className="mb-4 min-w-0 text-xs text-muted-foreground [overflow-wrap:anywhere]">Nom du fournisseur : {sport.providerName} · {sport._count.athletes.toLocaleString("fr-FR")} athlète{sport._count.athletes > 1 ? "s" : ""}</p><SportForm sport={{ id: sport.id, nameFr: sport.nameFr, active: sport.active }} /></article>)}{!sports.length && <p className="text-muted-foreground">Aucun sport importé.</p>}</div>
      {pagination("sportsPage", sportsPage, sportsCount, "sports")}
    </section>
    <section id="athletes" aria-labelledby="athletes-title"><h2 id="athletes-title" className="mb-4 text-2xl font-semibold">Athlètes importés</h2>
      <form method="get" action="/admin/imports#athletes" className="mb-5 flex flex-wrap items-end gap-3"><div className="min-w-48 flex-1 space-y-2"><label htmlFor="athlete-query" className="text-sm">Rechercher un nom</label><Input id="athlete-query" name="query" defaultValue={query} maxLength={100} /></div><Button type="submit" variant="outline">Rechercher</Button></form>
      <div className="grid items-start gap-4 lg:grid-cols-2">
        {athletes.map(athlete => <article key={athlete.id} className="min-w-0 rounded-xl border bg-card p-5" aria-labelledby={`athlete-title-${athlete.id}`}>
          <header className="mb-5 min-w-0 space-y-2">
            <h3 id={`athlete-title-${athlete.id}`} className="text-lg font-semibold [overflow-wrap:anywhere]">{athlete.name}</h3>
            <p className="text-sm text-muted-foreground [overflow-wrap:anywhere]">{athlete.nationality ?? "Nationalité non renseignée"}</p>
          </header>
          <dl className="mb-5 grid min-w-0 gap-3 text-sm">
            <div className="min-w-0"><dt className="text-xs text-muted-foreground">Sport</dt><dd className="mt-1 [overflow-wrap:anywhere]">{athlete.sport.nameFr}</dd></div>
            <div><dt className="text-xs text-muted-foreground">État</dt><dd className="mt-1">{athlete.active ? "Activé" : "Désactivé"}</dd></div>
            <div className="min-w-0"><dt className="text-xs text-muted-foreground">Identifiant interne</dt><dd className="mt-1 select-all text-xs [overflow-wrap:anywhere]">{athlete.id}</dd></div>
            {athlete.externalIds.filter(item => item.provider === "THESPORTSDB").map(item => <div key={item.id} className="min-w-0"><dt className="text-xs text-muted-foreground">Identifiant TheSportsDB</dt><dd className="mt-1 select-all text-xs [overflow-wrap:anywhere]">{item.externalId}</dd></div>)}
          </dl>
          <div className="min-w-0 border-t pt-2"><AthleteForm athlete={{ id: athlete.id, name: athlete.name, birthDate: athlete.birthDate?.toISOString().slice(0, 10) ?? null, nationality: athlete.nationality, currentTeam: athlete.currentTeam, position: athlete.position, biography: athlete.biography, prestigeOverride: athlete.prestigeOverride, active: athlete.active }} /></div>
        </article>)}
        {!athletes.length && <p className="text-muted-foreground">Aucun athlète trouvé.</p>}
      </div>
      {pagination("page", page, athletesCount, "athletes")}
    </section>
  </main>;
}
