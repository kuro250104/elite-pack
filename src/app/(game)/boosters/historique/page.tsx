import Link from "next/link";
import { requireUser } from "@/lib/auth/authorization";
import { db } from "@/lib/db/prisma";
import { historyQuerySchema, listOpeningHistory } from "@/server/boosters/history";
import { rarityPresentation } from "@/components/cards/athlete-card";
import { GameNav } from "@/components/layout/game-nav";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const selectClass = "min-h-11 w-full min-w-0 rounded-md border bg-background px-3 text-sm";
const statusLabels = { owned: "Dans ma collection", "sold-to-bank": "Revendue à la banque", traded: "Vendue sur le marché" };

export default async function OpeningHistoryPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser();
  const raw = await searchParams;
  const input = Object.fromEntries(Object.entries(raw).filter(([, value]) => typeof value === "string" && value !== ""));
  const parsed = historyQuerySchema.safeParse(input);
  const query = parsed.success ? parsed.data : historyQuerySchema.parse({});
  const [history, sports] = await Promise.all([listOpeningHistory(user.id, query),
    db.sport.findMany({ where: { selectedOpenings: { some: { userId: user.id } } }, select: { id: true, nameFr: true }, orderBy: { nameFr: "asc" } })]);
  const page = (number: number) => `/boosters/historique?${new URLSearchParams(Object.entries({ ...input, page: String(number) }).map(([key, value]) => [key, String(value)]))}`;
  return <main id="contenu" className="mx-auto min-w-0 max-w-5xl space-y-8 px-5 pb-12 sm:px-8"><GameNav />
    <Link href="/boosters" className="text-sm text-muted-foreground hover:underline">← Boosters</Link>
    <header><h1 className="text-3xl font-bold">Historique des ouvertures</h1>
      <p className="mt-3 text-muted-foreground">{history.total.toLocaleString("fr-FR")} ouverture{history.total > 1 ? "s" : ""}. Les cartes revendues ou échangées restent visibles ici.</p></header>
    {!parsed.success && <p role="alert" className="text-sm text-destructive">{parsed.error.issues[0]?.message ?? "Filtres invalides."} Les filtres ont été réinitialisés.</p>}
    <form action="/boosters/historique" className="grid items-end gap-4 rounded-xl border bg-card p-5 sm:grid-cols-2 lg:grid-cols-4">
      <div className="space-y-2"><label htmlFor="history-sport">Sport</label><select id="history-sport" name="sportId" defaultValue={query.sportId ?? ""} className={selectClass}><option value="">Tous les sports</option>{sports.map((sport) => <option key={sport.id} value={sport.id}>{sport.nameFr}</option>)}</select></div>
      <div className="space-y-2"><label htmlFor="history-from">Du</label><Input id="history-from" name="from" type="date" defaultValue={query.from} /></div>
      <div className="space-y-2"><label htmlFor="history-to">Au</label><Input id="history-to" name="to" type="date" defaultValue={query.to} /></div>
      <Button type="submit">Filtrer</Button>
    </form>
    <ol className="space-y-4">{history.openings.map((opening) => <li key={opening.id} className="space-y-3 rounded-xl border bg-card p-5">
      <p className="flex flex-wrap items-baseline justify-between gap-2"><span className="font-semibold">{opening.booster}{opening.sport ? ` · ${opening.sport}` : ""}</span>
        <span className="text-sm text-muted-foreground">{opening.source === "passive" ? "Booster gratuit" : "Booster offert"} · <time dateTime={opening.openedAt}>{new Date(opening.openedAt).toLocaleString("fr-FR", { dateStyle: "long", timeStyle: "short", timeZone: "Europe/Paris" })}</time></span></p>
      <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{opening.cards.map((card) => <li key={card.id} className={`min-w-0 rounded-lg border p-3 text-sm ${rarityPresentation[card.rarity].className}`}>
        <span className="block text-xs">{rarityPresentation[card.rarity].name}</span>
        <Link href={`/athletes/${card.athleteId}`} className="block font-semibold text-foreground hover:underline [overflow-wrap:anywhere]">{card.name}</Link>
        <span className="block text-xs text-muted-foreground [overflow-wrap:anywhere]">{card.editionName} · {statusLabels[card.status]}</span>
      </li>)}</ul>
    </li>)}</ol>
    {history.openings.length === 0 && <div className="rounded-xl border border-dashed p-8 text-center"><p className="mb-4 text-muted-foreground">Aucune ouverture pour cette sélection.</p><Button asChild><Link href="/boosters">Ouvrir un booster</Link></Button></div>}
    <nav aria-label="Pagination de l’historique" className="flex flex-wrap gap-4 text-sm">
      {history.page > 1 && <Link href={page(history.page - 1)} className="text-primary">Page précédente</Link>}<span>Page {history.page.toLocaleString("fr-FR")}</span>
      {history.page * history.pageSize < history.total && <Link href={page(history.page + 1)} className="text-primary">Page suivante</Link>}</nav>
  </main>;
}
