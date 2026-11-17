import Link from "next/link";
import { requireUser } from "@/lib/auth/authorization";
import { db } from "@/lib/db/prisma";
import { cn } from "@/lib/utils";
import { formatCoins } from "@/lib/currency";
import { listMarketplace, marketplaceHistory, marketplaceQuerySchema, type MarketplaceQuery } from "@/server/marketplace/service";
import { getWalletBalance } from "@/server/players/profile";
import { AthleteCard, rarityPresentation } from "@/components/cards/athlete-card";
import { BuyListingButton, CancelListingButton } from "@/components/marketplace/marketplace-actions";
import { GameNav } from "@/components/layout/game-nav";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

type View = MarketplaceQuery["view"] | "history";

function href(query: MarketplaceQuery, changes: Partial<MarketplaceQuery> & { view?: View }) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries({ ...query, ...changes }))
    if (value !== undefined && key !== "pageSize") params.set(key, String(value));
  return `/marche?${params}`;
}

export default async function MarketplacePage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  const raw = await searchParams;
  const input = Object.fromEntries(Object.entries(raw).filter(([, value]) => typeof value === "string" && value !== ""));
  const history = input.view === "history";
  const parsed = marketplaceQuerySchema.safeParse(history ? { ...input, view: "all" } : input);
  const query = parsed.success ? parsed.data : marketplaceQuerySchema.parse({});
  const [market, sales, balance, sports] = await Promise.all([
    history ? null : listMarketplace(user.id, query), history ? marketplaceHistory(user.id) : null, getWalletBalance(user.id),
    db.sport.findMany({ where: { active: true }, select: { id: true, nameFr: true }, orderBy: { nameFr: "asc" } }),
  ]);
  const tabs: [View, string][] = [["all", "Annonces"], ["mine", "Mes annonces"], ["history", "Historique"]];
  const current: View = history ? "history" : query.view;
  return <main id="contenu" className="mx-auto min-w-0 max-w-6xl space-y-8 px-5 pb-12 sm:px-8"><GameNav />
    <header>
      <h1 className="text-3xl font-bold">Marché</h1>
      <p className="mt-3 text-muted-foreground">Achetez les cartes des autres joueurs et vendez vos doublons. Votre solde : {formatCoins(balance)}.</p>
    </header>
    <nav aria-label="Affichage du marché" className="flex flex-wrap gap-2">
      {tabs.map(([view, label]) => <Link key={view} href={href(query, { view: view as MarketplaceQuery["view"], page: 1 })} aria-current={current === view ? "page" : undefined}
        className={cn("rounded-md border px-4 py-2 text-sm font-medium", current === view ? "bg-primary text-primary-foreground" : "hover:bg-secondary")}>{label}</Link>)}
    </nav>

    {sales && <section aria-labelledby="history-title" className="space-y-4">
      <h2 id="history-title" className="text-xl font-semibold">Mes ventes et achats</h2>
      {sales.length === 0 ? <p className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">Aucune transaction sur le marché pour le moment.</p>
        : <ul className="divide-y rounded-xl border bg-card">{sales.map((sale) => <li key={sale.id} className="flex flex-wrap items-center justify-between gap-2 p-4 text-sm">
            <span className="min-w-0 [overflow-wrap:anywhere]"><span className={cn("mr-2 font-semibold", sale.direction === "sale" ? "text-rarity-uncommon" : "text-rarity-mythic")}>{sale.direction === "sale" ? "Vente" : "Achat"}</span>
              {sale.athlete} · {sale.editionName} · <span className={rarityPresentation[sale.rarity].className.split(" ")[0]}>{rarityPresentation[sale.rarity].name}</span></span>
            <span className="text-muted-foreground">{sale.direction === "sale" ? "+" : "−"}{formatCoins(BigInt(sale.price))} · {new Date(sale.closedAt).toLocaleDateString("fr-FR", { timeZone: "Europe/Paris" })}</span>
          </li>)}</ul>}
    </section>}

    {market && <>
      <form action="/marche" className="grid items-end gap-4 rounded-xl border bg-card p-5 sm:grid-cols-2 lg:grid-cols-4">
        <input type="hidden" name="view" value={query.view} />
        <div className="space-y-2"><label htmlFor="market-query">Athlète</label><Input id="market-query" name="query" defaultValue={query.query} maxLength={100} /></div>
        <div className="space-y-2"><label htmlFor="market-sport">Sport</label><select id="market-sport" name="sportId" defaultValue={query.sportId ?? ""} className="field-select"><option value="">Tous les sports</option>{sports.map((sport) => <option key={sport.id} value={sport.id}>{sport.nameFr}</option>)}</select></div>
        <div className="space-y-2"><label htmlFor="market-rarity">Rareté</label><select id="market-rarity" name="rarity" defaultValue={query.rarity ?? ""} className="field-select"><option value="">Toutes les raretés</option>{Object.entries(rarityPresentation).map(([key, value]) => <option key={key} value={key}>{value.name}</option>)}</select></div>
        <div className="space-y-2"><label htmlFor="market-sort">Trier par</label><select id="market-sort" name="sort" defaultValue={query.sort} className="field-select"><option value="recent">Plus récentes</option><option value="price-asc">Prix croissant</option><option value="price-desc">Prix décroissant</option></select></div>
        <div className="space-y-2"><label htmlFor="market-min">Prix minimum</label><Input id="market-min" name="minPrice" type="number" inputMode="numeric" min={1} step={1} defaultValue={query.minPrice} /></div>
        <div className="space-y-2"><label htmlFor="market-max">Prix maximum</label><Input id="market-max" name="maxPrice" type="number" inputMode="numeric" min={1} step={1} defaultValue={query.maxPrice} /></div>
        <Button type="submit">Filtrer</Button>
        <Link href={href(marketplaceQuerySchema.parse({ view: query.view }), {})} className="self-center text-sm text-primary hover:underline">Réinitialiser</Link>
      </form>
      <p className="text-sm text-muted-foreground">{market.total.toLocaleString("fr-FR")} annonce{market.total > 1 ? "s" : ""}</p>
      <div id="market-listings" className="grid items-stretch gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {market.listings.map((listing) => {
          const label = `${listing.card.name}, ${listing.card.editionName}`;
          const price = formatCoins(BigInt(listing.price));
          return <div key={listing.id} className="flex h-full min-w-0 flex-col gap-2">
            <div className="flex flex-1 flex-col"><AthleteCard card={listing.card} /></div>
            <p className="text-center text-lg font-semibold">{price}</p>
            <p className="text-center text-xs text-muted-foreground [overflow-wrap:anywhere]">Vendue par {listing.mine ? "vous" : listing.seller} · Valeur {formatCoins(BigInt(listing.baseValue))}</p>
            {listing.mine ? <CancelListingButton listingId={listing.id} cardLabel={label} />
              : BigInt(listing.price) > balance ? <p className="text-center text-xs text-muted-foreground">Solde insuffisant</p>
              : <BuyListingButton listingId={listing.id} cardLabel={label} priceLabel={price} />}
          </div>;
        })}
      </div>
      {market.listings.length === 0 && <p className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">{query.view === "mine"
        ? "Vous n’avez aucune carte en vente. Mettez une carte en vente depuis votre collection." : "Aucune annonce pour cette sélection."}</p>}
      <nav aria-label="Pagination du marché" className="flex flex-wrap gap-4 text-sm">
        {market.page > 1 && <Link href={href(query, { page: market.page - 1 })} className="text-primary">Page précédente</Link>}
        <span>Page {market.page.toLocaleString("fr-FR")}</span>
        {market.page * market.pageSize < market.total && <Link href={href(query, { page: market.page + 1 })} className="text-primary">Page suivante</Link>}
      </nav>
    </>}
  </main>;
}
