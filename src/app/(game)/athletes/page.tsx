import Link from "next/link";
import { BookOpen, Lock } from "lucide-react";
import { requireUser } from "@/lib/auth/authorization";
import { db } from "@/lib/db/prisma";
import { listEncyclopedia, encyclopediaQuerySchema, type EncyclopediaQuery } from "@/server/athletes/encyclopedia";
import { GameNav } from "@/components/layout/game-nav";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";


function href(query: EncyclopediaQuery, page: number) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries({ ...query, page }))
    if (value !== undefined && key !== "pageSize") params.set(key, String(value));
  return `/athletes?${params}`;
}

export default async function EncyclopediaPage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  const raw = await searchParams;
  const input = Object.fromEntries(Object.entries(raw).filter(([, value]) => typeof value === "string" && value !== ""));
  const parsed = encyclopediaQuerySchema.safeParse(input);
  const query = parsed.success ? parsed.data : encyclopediaQuerySchema.parse({});
  const [result, sports] = await Promise.all([listEncyclopedia(user.id, query),
    db.sport.findMany({ where: { active: true }, select: { id: true, nameFr: true }, orderBy: { nameFr: "asc" } })]);
  return <main id="contenu" className="mx-auto min-w-0 max-w-6xl space-y-8 px-5 pb-12 sm:px-8"><GameNav />
    <header>
      <h1 className="text-3xl font-bold">Encyclopédie des athlètes</h1>
      <p className="mt-3 text-muted-foreground">{result.total.toLocaleString("fr-FR")} athlète{result.total > 1 ? "s" : ""}. Obtenez une de leurs cartes pour débloquer biographie, palmarès et statistiques.</p>
    </header>
    <form action="/athletes" className="grid items-end gap-4 rounded-xl border bg-card p-5 sm:grid-cols-2 lg:grid-cols-4">
      <div className="space-y-2"><label htmlFor="encyclopedia-query">Athlète</label><Input id="encyclopedia-query" name="query" defaultValue={query.query} maxLength={100} /></div>
      <div className="space-y-2"><label htmlFor="encyclopedia-sport">Sport</label><select id="encyclopedia-sport" name="sportId" defaultValue={query.sportId ?? ""} className="field-select"><option value="">Tous les sports</option>{sports.map((sport) => <option key={sport.id} value={sport.id}>{sport.nameFr}</option>)}</select></div>
      <div className="space-y-2"><label htmlFor="encyclopedia-discovered">Fiches</label><select id="encyclopedia-discovered" name="discovered" defaultValue={query.discovered} className="field-select"><option value="all">Toutes les fiches</option><option value="yes">Fiches débloquées</option><option value="no">Fiches verrouillées</option></select></div>
      <Button type="submit">Rechercher</Button>
    </form>
    <ul id="encyclopedia-athletes" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {result.athletes.map((athlete) => <li key={athlete.id}>
        <Link href={`/athletes/${athlete.id}`} className="flex h-full min-w-0 items-start gap-4 rounded-xl border bg-card p-5 hover:border-primary">
          {athlete.discovered ? <BookOpen className="mt-1 size-5 shrink-0 text-primary" aria-hidden="true" /> : <Lock className="mt-1 size-5 shrink-0 text-muted-foreground" aria-hidden="true" />}
          <span className="min-w-0 space-y-1">
            <span className="block font-semibold [overflow-wrap:anywhere]">{athlete.name}</span>
            <span className="block text-sm text-muted-foreground [overflow-wrap:anywhere]">{athlete.sport}{athlete.nationality ? ` · ${athlete.nationality}` : ""}</span>
            <span className="block text-xs text-muted-foreground">{athlete.discovered ? "Fiche débloquée" : "Fiche verrouillée"} · {athlete.ownedEditions} / {athlete.editions} édition{athlete.editions > 1 ? "s" : ""} possédée{athlete.ownedEditions > 1 ? "s" : ""}</span>
          </span>
        </Link>
      </li>)}
    </ul>
    {result.athletes.length === 0 && <p className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">Aucun athlète pour cette recherche.</p>}
    <nav aria-label="Pagination de l’encyclopédie" className="flex flex-wrap gap-4 text-sm">
      {result.page > 1 && <Link href={href(query, result.page - 1)} className="text-primary">Page précédente</Link>}
      <span>Page {result.page.toLocaleString("fr-FR")}</span>
      {result.page * result.pageSize < result.total && <Link href={href(query, result.page + 1)} className="text-primary">Page suivante</Link>}
    </nav>
  </main>;
}
