import Link from "next/link";
import { requireAdmin } from "@/lib/auth/authorization";
import { db } from "@/lib/db/prisma";
import { formatCoins } from "@/lib/currency";
import { editionQuerySchema, listAdminEditions } from "@/server/admin/editions";
import { recentAdminChanges } from "@/server/admin/economy";
import { rarityPresentation } from "@/components/cards/athlete-card";
import { EditionCreateForm, EditionForm } from "@/components/admin/edition-forms";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const selectClass = "min-h-11 w-full min-w-0 rounded-md border bg-background px-3 text-sm";

export default async function EditionsAdminPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireAdmin();
  const raw = await searchParams;
  const input = Object.fromEntries(Object.entries(raw).filter(([, value]) => typeof value === "string" && value !== ""));
  const parsed = editionQuerySchema.safeParse(input);
  const query = parsed.success ? parsed.data : editionQuerySchema.parse({});
  const [result, athletes, changes] = await Promise.all([
    listAdminEditions(query),
    db.athlete.findMany({ where: query.query ? { name: { contains: query.query, mode: "insensitive" } } : {}, orderBy: { name: "asc" }, take: 50,
      select: { id: true, name: true, sport: { select: { nameFr: true } } } }),
    recentAdminChanges(undefined, ["EDITION_CREATE", "EDITION_UPDATE"], 15),
  ]);
  const page = (number: number) => `/admin/editions?${new URLSearchParams(Object.entries({ ...input, page: String(number) }).map(([key, value]) => [key, String(value)]))}`;
  return <main id="contenu" className="mx-auto min-w-0 max-w-6xl space-y-10 px-5 py-12">
    <Link href="/admin" className="text-sm text-primary hover:underline">← Administration</Link>
    <header className="space-y-2"><h1 className="text-3xl font-bold">Éditions de cartes</h1>
      <p className="max-w-3xl text-muted-foreground">La valeur d’une édition est calculée à partir de sa rareté et du prestige de l’athlète. Une fois des exemplaires frappés, la rareté et le mode de tirage (limité ou illimité) sont verrouillés, et un tirage limité ne peut pas descendre sous le nombre déjà frappé. Pour modifier un athlète ou corriger son prestige, utilisez <Link href="/admin/imports" className="text-primary underline">Imports et catalogue</Link>.</p></header>

    <form action="/admin/editions" className="grid items-end gap-4 rounded-xl border bg-card p-5 sm:grid-cols-[2fr_1fr_auto]">
      <div className="space-y-1"><label htmlFor="editions-query" className="text-sm font-medium">Athlète ou édition</label><Input id="editions-query" name="query" defaultValue={query.query} maxLength={100} /></div>
      <div className="space-y-1"><label htmlFor="editions-rarity" className="text-sm font-medium">Rareté</label><select id="editions-rarity" name="rarity" defaultValue={query.rarity ?? ""} className={selectClass}><option value="">Toutes</option>{Object.entries(rarityPresentation).map(([key, value]) => <option key={key} value={key}>{value.name}</option>)}</select></div>
      <Button type="submit">Rechercher</Button>
    </form>

    <section aria-labelledby="create-title" className="space-y-3"><h2 id="create-title" className="text-xl font-semibold">Créer une édition</h2>
      <EditionCreateForm athletes={athletes.map((athlete) => ({ id: athlete.id, name: athlete.name, sport: athlete.sport.nameFr }))} /></section>

    <section aria-labelledby="list-title" className="space-y-4"><h2 id="list-title" className="text-xl font-semibold">{result.total.toLocaleString("fr-FR")} édition{result.total > 1 ? "s" : ""}</h2>
      <ul className="space-y-3">{result.editions.map((edition) => <li key={edition.id} className="space-y-3 rounded-xl border bg-card p-4">
        <p className="flex flex-wrap items-baseline justify-between gap-2 text-sm"><span className="font-semibold [overflow-wrap:anywhere]">{edition.athlete} <span className="font-normal text-muted-foreground">· {edition.sport}</span></span>
          <span className="text-muted-foreground"><span className={rarityPresentation[edition.rarity].className.split(" ")[0]}>{rarityPresentation[edition.rarity].name}</span> · {edition.mintedSupply.toLocaleString("fr-FR")}{edition.maxSupply === null ? "" : ` / ${edition.maxSupply.toLocaleString("fr-FR")}`} frappé{edition.mintedSupply > 1 ? "s" : ""} · {formatCoins(BigInt(edition.baseValue))} · {edition.boosters} booster{edition.boosters > 1 ? "s" : ""}</span></p>
        <EditionForm edition={edition} />
      </li>)}</ul>
      {result.editions.length === 0 && <p className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">Aucune édition pour cette recherche.</p>}
      <nav aria-label="Pagination des éditions" className="flex flex-wrap gap-4 text-sm">
        {result.page > 1 && <Link href={page(result.page - 1)} className="text-primary">Page précédente</Link>}<span>Page {result.page.toLocaleString("fr-FR")}</span>
        {result.page * result.pageSize < result.total && <Link href={page(result.page + 1)} className="text-primary">Page suivante</Link>}</nav>
    </section>

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
