import type { ReactNode } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { rarityPresentation } from "@/components/cards/athlete-card";
import { cn } from "@/lib/utils";
import type { WishlistCardView } from "@/server/wishlist/service";

export function WishlistCard({ card, action }: { card: WishlistCardView; action: ReactNode }) {
  const rarity = rarityPresentation[card.rarity];
  const marketQuery = new URLSearchParams({ query: card.name, rarity: card.rarity });
  return <article className={cn("flex h-full min-w-0 flex-col gap-3 rounded-xl border bg-card p-4", rarity.className)}>
    <div className="flex flex-wrap items-center justify-between gap-2">
      <span className="text-xs font-semibold">{rarity.name}</span>
      {card.owned && <Badge variant="secondary">Possédée</Badge>}
    </div>
    <div className="space-y-1 [overflow-wrap:anywhere]">
      <h2 className="font-semibold text-foreground">
        <Link className="hover:underline" href={`/athletes/${card.athleteId}`}>{card.name}</Link>
      </h2>
      <p className="text-sm text-muted-foreground">{card.editionName} · {card.sport}</p>
    </div>
    {card.activeListings > 0 && <Link href={`/marche?${marketQuery}`} className="text-sm text-primary hover:underline">
      Disponible sur le marché ({card.activeListings.toLocaleString("fr-FR")})
    </Link>}
    <div className="mt-auto pt-1">{action}</div>
  </article>;
}
