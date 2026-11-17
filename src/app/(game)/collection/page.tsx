import Link from "next/link";
import { requireUser } from "@/lib/auth/authorization";
import { db } from "@/lib/db/prisma";
import { cn } from "@/lib/utils";
import { listCollection, collectionProgress, collectionFacets, collectionQuerySchema, type CollectionQuery } from "@/server/collection/service";
import { AthleteCard, rarityPresentation } from "@/components/cards/athlete-card";
import { MissingCard } from "@/components/collection/missing-card";
import { CollectionProgress } from "@/components/collection/collection-progress";
import { GameNav } from "@/components/layout/game-nav";
import { SellToBankButton } from "@/components/economy/sell-to-bank-button";
import { formatCoins } from "@/lib/currency";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const sortLabels: Record<CollectionQuery["sort"], string> = {
  recent: "Date d’obtention", name: "Nom de l’athlète", rarity: "Rareté", prestige: "Prestige", value: "Valeur",
};

function href(query: CollectionQuery, changes: Partial<CollectionQuery>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries({ ...query, ...changes }))
    if (value !== undefined && key !== "pageSize") params.set(key, String(value));
  return `/collection?${params}`;
}

export default async function CollectionPage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  const raw = await searchParams;
  const input = Object.fromEntries(Object.entries(raw).filter(([, value]) => typeof value === "string" && value !== ""));
  const parsed = collectionQuerySchema.safeParse(input);
  const query = parsed.success ? parsed.data : collectionQuerySchema.parse({});
  const [collection, progress, facets, sports] = await Promise.all([
    listCollection(user.id, query), collectionProgress(user.id), collectionFacets(user.id),
    db.sport.findMany({ where: { active: true }, select: { id: true, nameFr: true }, orderBy: { nameFr: "asc" } }),
  ]);
  const missingView = query.status === "missing";
  const shown = missingView ? collection.missing.length : collection.cards.length;
  return <main id="contenu" className="mx-auto min-w-0 max-w-6xl space-y-8 px-5 pb-12 sm:px-8"><GameNav />
    <header>
      <h1 className="text-3xl font-bold">Ma collection</h1>
      <p className="mt-3 text-muted-foreground">{missingView
        ? `${collection.total.toLocaleString("fr-FR")} édition${collection.total > 1 ? "s" : ""} à obtenir.`
        : `${collection.total.toLocaleString("fr-FR")} carte${collection.total > 1 ? "s" : ""} · Chaque exemplaire est conservé, y compris vos doublons.`}</p>
    </header>
    <CollectionProgress progress={progress} />
    <nav aria-label="Affichage de la collection" className="flex gap-2">
      {([["owned", "Mes cartes"], ["missing", "Cartes manquantes"]] as const).map(([status, label]) =>
        <Link key={status} href={href(query, { status, page: 1 })} aria-current={query.status === status ? "page" : undefined}
          className={cn("rounded-md border px-4 py-2 text-sm font-medium", query.status === status ? "bg-primary text-primary-foreground" : "hover:bg-secondary")}>{label}</Link>)}
    </nav>
    <form action="/collection" className="grid items-end gap-4 rounded-xl border bg-card p-5 sm:grid-cols-2 lg:grid-cols-4">
      <input type="hidden" name="status" value={query.status} />
      <div className="space-y-2"><label htmlFor="collection-query">Athlète</label><Input id="collection-query" name="query" defaultValue={query.query} maxLength={100} /></div>
      <div className="space-y-2"><label htmlFor="collection-sport">Sport</label><select id="collection-sport" name="sportId" defaultValue={query.sportId ?? ""} className="field-select"><option value="">Tous les sports</option>{sports.map((sport) => <option key={sport.id} value={sport.id}>{sport.nameFr}</option>)}</select></div>
      <div className="space-y-2"><label htmlFor="collection-rarity">Rareté</label><select id="collection-rarity" name="rarity" defaultValue={query.rarity ?? ""} className="field-select"><option value="">Toutes les raretés</option>{Object.entries(rarityPresentation).map(([key, value]) => <option key={key} value={key}>{value.name}</option>)}</select></div>
      <div className="space-y-2"><label htmlFor="collection-sort">Trier par</label><select id="collection-sort" name="sort" defaultValue={query.sort} className="field-select">{Object.entries(sortLabels).map(([key, label]) => <option key={key} value={key}>{key === "recent" && missingView ? "Date de sortie" : label}</option>)}</select></div>
      <div className="space-y-2"><label htmlFor="collection-country">Pays</label><select id="collection-country" name="country" defaultValue={query.country ?? ""} className="field-select"><option value="">Tous les pays</option>{facets.countries.map((country) => <option key={country} value={country}>{country}</option>)}</select></div>
      <div className="space-y-2"><label htmlFor="collection-team">Équipe</label><select id="collection-team" name="team" defaultValue={query.team ?? ""} className="field-select"><option value="">Toutes les équipes</option>{facets.teams.map((team) => <option key={team} value={team}>{team}</option>)}</select></div>
      <Button type="submit">Filtrer</Button>
      <Link href={href(collectionQuerySchema.parse({ status: query.status }), {})} className="self-center text-sm text-primary hover:underline">Réinitialiser</Link>
    </form>
    <div id="collection-cards" className="grid items-stretch gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {missingView
        ? collection.missing.map((card) => <MissingCard key={card.editionId} card={card} />)
        : collection.cards.map((card) => <div key={card.instanceId} className="flex h-full min-w-0 flex-col gap-2">
            {/* The card fills the remaining height; the lines below never overlap the next row. */}
            <div className="flex flex-1 flex-col"><AthleteCard card={card} /></div>
            <p className="text-center text-xs text-muted-foreground">{collection.duplicates[card.editionId] ?? 1} exemplaire{(collection.duplicates[card.editionId] ?? 1) > 1 ? "s" : ""} de cette édition · <Link href={`/athletes/${card.athleteId}`} className="text-primary hover:underline">Voir la fiche</Link></p>
            {card.baseValue !== undefined && card.bankPrice !== undefined && <>
              <p className="text-center text-xs text-muted-foreground">Valeur : {formatCoins(BigInt(card.baseValue))} · Rachat banque : {formatCoins(BigInt(card.bankPrice))}</p>
              <SellToBankButton cardInstanceId={card.instanceId} cardLabel={`${card.name}, ${card.editionName}`} priceLabel={formatCoins(BigInt(card.bankPrice))} />
            </>}
          </div>)}
    </div>
    {shown === 0 && <div className="rounded-xl border border-dashed p-8 text-center">{missingView
      ? <p className="text-muted-foreground">Aucune carte manquante pour cette sélection.</p>
      : <><p className="mb-4 text-muted-foreground">Aucune carte pour cette sélection. Ouvrez votre premier booster pour commencer.</p><Button asChild><Link href="/boosters">Découvrir mes boosters</Link></Button></>}</div>}
    <nav aria-label="Pagination de la collection" className="flex flex-wrap gap-4 text-sm">
      {collection.page > 1 && <Link href={href(query, { page: collection.page - 1 })} className="text-primary">Page précédente</Link>}
      <span>Page {collection.page.toLocaleString("fr-FR")}</span>
      {collection.page * collection.pageSize < collection.total && <Link href={href(query, { page: collection.page + 1 })} className="text-primary">Page suivante</Link>}
    </nav>
  </main>;
}
