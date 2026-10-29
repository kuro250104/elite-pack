import Link from "next/link";
import { requireUser } from "@/lib/auth/authorization";
import { db } from "@/lib/db/prisma";
import { listCollection, collectionQuerySchema } from "@/server/collection/service";
import { AthleteCard, rarityPresentation } from "@/components/cards/athlete-card";
import { GameNav } from "@/components/layout/game-nav";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
export default async function CollectionPage({ searchParams }: {
    searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
    const user = await requireUser();
    const raw = await searchParams;
    const input = Object.fromEntries(Object.entries(raw).filter(([, value]) => typeof value === "string" && value !== ""));
    const parsed = collectionQuerySchema.safeParse(input);
    const query = parsed.success ? parsed.data : collectionQuerySchema.parse({});
    const [collection, sports] = await Promise.all([listCollection(user.id, query), db.sport.findMany({ where: { active: true }, select: { id: true, nameFr: true }, orderBy: { nameFr: "asc" } })]);
    function href(page: number) { const params = new URLSearchParams(); for (const [key, value] of Object.entries(query))
        if (value !== undefined)
            params.set(key, String(value)); params.set("page", String(page)); return `/collection?${params}`; }
    return <main id="contenu" className="mx-auto min-w-0 max-w-6xl space-y-8 px-5 pb-12 sm:px-8"><GameNav /><header><h1 className="text-3xl font-bold">Ma collection</h1><p className="mt-3 text-muted-foreground">{collection.total.toLocaleString("fr-FR")} carte{collection.total > 1 ? "s" : ""} · Chaque exemplaire est conservé, y compris vos doublons.</p></header>
    <form action="/collection" className="grid items-end gap-4 rounded-xl border bg-card p-5 sm:grid-cols-2 lg:grid-cols-5"><div className="space-y-2"><label htmlFor="collection-query">Athlète</label><Input id="collection-query" name="query" defaultValue={query.query} maxLength={100}/></div><div className="space-y-2"><label htmlFor="collection-sport">Sport</label><select id="collection-sport" name="sportId" defaultValue={query.sportId ?? ""} className="min-h-11 w-full min-w-0 rounded-md border bg-background px-3 text-sm"><option value="">Tous les sports</option>{sports.map(sport => <option key={sport.id} value={sport.id}>{sport.nameFr}</option>)}</select></div><div className="space-y-2"><label htmlFor="collection-rarity">Rareté</label><select id="collection-rarity" name="rarity" defaultValue={query.rarity ?? ""} className="min-h-11 w-full rounded-md border bg-background px-3 text-sm"><option value="">Toutes les raretés</option>{Object.entries(rarityPresentation).map(([key, value]) => <option key={key} value={key}>{value.name}</option>)}</select></div><div className="space-y-2"><label htmlFor="collection-sort">Trier par</label><select id="collection-sort" name="sort" defaultValue={query.sort} className="min-h-11 w-full rounded-md border bg-background px-3 text-sm"><option value="recent">Date d’obtention</option><option value="name">Nom de l’athlète</option><option value="rarity">Rareté</option></select></div><Button type="submit">Filtrer</Button></form>
    <div id="collection-cards" className="grid items-stretch gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{collection.cards.map(card => <div key={card.instanceId} className="space-y-2"><AthleteCard card={card}/><p className="text-center text-xs text-muted-foreground">{collection.duplicates[card.editionId] ?? 1} exemplaire{(collection.duplicates[card.editionId] ?? 1) > 1 ? "s" : ""} de cette édition</p></div>)}</div>
    {!collection.cards.length && <div className="rounded-xl border border-dashed p-8 text-center"><p className="mb-4 text-muted-foreground">Aucune carte pour cette sélection. Ouvrez votre premier booster pour commencer.</p><Button asChild><Link href="/boosters">Découvrir mes boosters</Link></Button></div>}
    <nav aria-label="Pagination de la collection" className="flex flex-wrap gap-4 text-sm">{collection.page > 1 && <Link href={href(collection.page - 1)} className="text-primary">Page précédente</Link>}<span>Page {collection.page.toLocaleString("fr-FR")}</span>{collection.page * collection.pageSize < collection.total && <Link href={href(collection.page + 1)} className="text-primary">Page suivante</Link>}</nav>
  </main>;
}
