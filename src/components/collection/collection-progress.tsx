type Progress = { sports: { sportId: string; sport: string; owned: number; total: number }[]; owned: number; total: number };

function percent(owned: number, total: number) { return total === 0 ? 0 : Math.floor((owned / total) * 100); }

export function CollectionProgress({ progress }: { progress: Progress }) {
  if (progress.total === 0) return null;
  return <section aria-labelledby="progress-title" className="space-y-4 rounded-xl border bg-card p-5">
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <h2 id="progress-title" className="text-lg font-semibold">Progression</h2>
      <p className="text-sm text-muted-foreground">{progress.owned.toLocaleString("fr-FR")} / {progress.total.toLocaleString("fr-FR")} éditions · {percent(progress.owned, progress.total)} %</p>
    </div>
    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {progress.sports.map((sport) => <li key={sport.sportId} className="min-w-0 space-y-2">
        <div className="flex justify-between gap-3 text-sm"><span className="[overflow-wrap:anywhere]">{sport.sport}</span><span className="shrink-0 text-muted-foreground">{sport.owned} / {sport.total}</span></div>
        <progress className="h-2 w-full overflow-hidden rounded-full [&::-moz-progress-bar]:bg-primary [&::-webkit-progress-bar]:bg-secondary [&::-webkit-progress-value]:bg-primary"
          value={sport.owned} max={sport.total} aria-label={`Progression ${sport.sport} : ${percent(sport.owned, sport.total)} %`} />
      </li>)}
    </ul>
  </section>;
}
