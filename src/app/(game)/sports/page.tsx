import Link from "next/link";
import { requireUser } from "@/lib/auth/authorization";
import { listSportsCatalogue } from "@/server/sports/catalogue";
import { SportIcon } from "@/components/sports/sport-icon";
import { GameNav } from "@/components/layout/game-nav";

const plural = (count: number, word: string) => `${count.toLocaleString("fr-FR")} ${word}${count > 1 ? "s" : ""}`;

export default async function SportsPage() {
  const user = await requireUser();
  const sports = await listSportsCatalogue(user.id);
  return <main id="contenu" className="mx-auto min-w-0 max-w-6xl space-y-8 px-5 pb-12 sm:px-8"><GameNav />
    <header><h1 className="text-3xl font-bold">Sports</h1>
      <p className="mt-3 text-muted-foreground">{plural(sports.length, "discipline")} au catalogue. Choisissez un sport à l’ouverture d’un booster pour obtenir ses athlètes.</p></header>
    {sports.length === 0 ? <p className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">Aucun sport n’est encore disponible.</p>
      : <ul id="sports-list" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{sports.map((sport) => {
          const percent = sport.editions ? Math.floor((sport.owned / sport.editions) * 100) : 0;
          return <li key={sport.id}><Link href={`/sports/${sport.id}`} className="flex h-full min-w-0 flex-col gap-4 rounded-xl border bg-card p-5 hover:border-primary">
            <span className="flex items-center gap-3"><span className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-secondary"><SportIcon nameFr={sport.nameFr} icon={sport.icon} className="size-6 text-primary" /></span>
              <span className="min-w-0"><span className="block text-lg font-semibold [overflow-wrap:anywhere]">{sport.nameFr}</span>
                <span className="block text-sm text-muted-foreground">{plural(sport.athletes, "athlète")} · {plural(sport.editions, "carte")} à collectionner</span></span></span>
            <span className="mt-auto space-y-1 text-sm"><span className="flex justify-between"><span className="text-muted-foreground">Ma progression</span><span>{sport.owned} / {sport.editions}</span></span>
              <span className="block h-2 overflow-hidden rounded-full bg-secondary" aria-hidden="true"><span className="block h-full rounded-full bg-primary" style={{ width: `${percent}%` }} /></span>
              <span className="sr-only">{percent} % des cartes de ce sport possédées</span></span>
          </Link></li>;
        })}</ul>}
  </main>;
}
