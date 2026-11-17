import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/authorization";
import { ApiError } from "@/lib/api/errors";
import { getSportDetail } from "@/server/sports/catalogue";
import { SportIcon } from "@/components/sports/sport-icon";
import { GameNav } from "@/components/layout/game-nav";
import { Button } from "@/components/ui/button";

async function loadSport(actorId: string, id: string) {
  try { return await getSportDetail(actorId, id); }
  catch (error) { if (error instanceof ApiError && error.code === "SPORT_NOT_FOUND") notFound(); throw error; }
}

export default async function SportPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const sport = await loadSport(user.id, id);
  const stats: [string, number][] = [["Athlètes", sport.athletes], ["Cartes à collectionner", sport.editions], ["Mes cartes différentes", sport.owned], ["Cartes déjà frappées", sport.minted]];
  return <main id="contenu" className="mx-auto min-w-0 max-w-5xl space-y-8 px-5 pb-12 sm:px-8"><GameNav />
    <Link href="/sports" className="text-sm text-muted-foreground hover:underline">← Sports</Link>
    <header className="flex items-center gap-4"><span className="flex size-16 shrink-0 items-center justify-center rounded-xl bg-secondary"><SportIcon nameFr={sport.nameFr} icon={sport.icon} className="size-8 text-primary" /></span>
      <h1 className="text-3xl font-bold [overflow-wrap:anywhere]">{sport.nameFr}</h1></header>
    <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{stats.map(([label, value]) => <div key={label} className="rounded-xl border bg-card p-5"><dt className="text-sm text-muted-foreground">{label}</dt><dd className="mt-2 text-2xl font-semibold">{value.toLocaleString("fr-FR")}</dd></div>)}</dl>
    <div className="flex flex-wrap gap-3">
      <Button asChild><Link href="/boosters">Ouvrir un booster</Link></Button>
      <Button asChild variant="outline"><Link href={`/collection?sportId=${sport.id}`}>Mes cartes de ce sport</Link></Button>
      <Button asChild variant="outline"><Link href={`/athletes?sportId=${sport.id}`}>Encyclopédie de ce sport</Link></Button>
    </div>
    <section aria-labelledby="top-title" className="space-y-3"><h2 id="top-title" className="text-xl font-semibold">Athlètes les plus prestigieux</h2>
      {sport.topAthletes.length === 0 ? <p className="text-sm text-muted-foreground">Aucun athlète n’est encore disponible dans ce sport.</p>
        : <ol className="divide-y rounded-xl border bg-card">{sport.topAthletes.map((athlete, index) => <li key={athlete.id}>
            <Link href={`/athletes/${athlete.id}`} className="flex items-center justify-between gap-3 p-3 hover:bg-secondary/50">
              <span className="min-w-0 [overflow-wrap:anywhere]"><span className="mr-3 text-muted-foreground tabular-nums">{index + 1}.</span>{athlete.name}</span>
              <span className="shrink-0 text-sm text-muted-foreground">Prestige {athlete.prestige} / 100</span></Link></li>)}</ol>}
    </section>
  </main>;
}
