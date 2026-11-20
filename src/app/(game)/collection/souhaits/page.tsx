import Link from "next/link";
import { CollectionTabs } from "@/components/collection/collection-tabs";
import { WishlistButton } from "@/components/collection/wishlist-button";
import { WishlistCard } from "@/components/collection/wishlist-card";
import { GameNav } from "@/components/layout/game-nav";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/lib/auth/authorization";
import { listWishlist, wishlistQuerySchema } from "@/server/wishlist/service";

export default async function WishlistPage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  const { page, pageSize } = await searchParams;
  const parsed = wishlistQuerySchema.safeParse({ page, pageSize });
  const query = parsed.success ? parsed.data : wishlistQuerySchema.parse({});
  const wishlist = await listWishlist(user.id, query);
  const href = (targetPage: number) => `/collection/souhaits?page=${targetPage}&pageSize=${wishlist.pageSize}`;

  return <main id="contenu" className="mx-auto min-w-0 max-w-6xl space-y-8 px-5 pb-12 sm:px-8">
    <GameNav />
    <h1 className="text-3xl font-bold">Liste de souhaits</h1>
    <CollectionTabs current="wishlist" />
    {wishlist.total === 0 ? <div className="space-y-4 rounded-xl border border-dashed p-6 text-center">
      <p className="text-muted-foreground">Votre liste de souhaits est vide. Ajoutez des éditions depuis l’encyclopédie.</p>
      <Button asChild><Link href="/athletes">Parcourir l’encyclopédie</Link></Button>
    </div> : <>
      {wishlist.items.length === 0
        ? <p className="text-muted-foreground">Aucune édition sur cette page.</p>
        : <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {wishlist.items.map((card) => <li key={card.editionId} className="min-w-0">
            <WishlistCard card={card} action={<WishlistButton editionId={card.editionId} wishlisted />} />
          </li>)}
        </ul>}
      <nav aria-label="Pagination de la liste de souhaits" className="flex flex-wrap gap-4 text-sm">
        {wishlist.page > 1 && <Link href={href(wishlist.page - 1)} className="text-primary hover:underline">Page précédente</Link>}
        <span>Page {wishlist.page.toLocaleString("fr-FR")}</span>
        {wishlist.page * wishlist.pageSize < wishlist.total && <Link href={href(wishlist.page + 1)} className="text-primary hover:underline">Page suivante</Link>}
      </nav>
    </>}
  </main>;
}
