import Link from "next/link";
import { Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { rarityPresentation } from "@/components/cards/athlete-card";
import type { MissingCardView } from "@/server/collection/service";

export function MissingCard({ card }: { card: MissingCardView }) {
  const rarity = rarityPresentation[card.rarity];
  return <article className={cn("flex h-full min-w-0 flex-col overflow-hidden rounded-xl border border-dashed bg-card/40 opacity-80", rarity.className)}
    aria-label={`${card.name}, ${card.editionName}, ${rarity.name}, carte manquante`}>
    <div className="flex items-center justify-between gap-3 border-b border-inherit px-4 py-3 text-xs"><span>{rarity.name}</span><span>{card.maxSupply === null ? "Édition non numérotée" : `Tirage limité à ${card.maxSupply.toLocaleString("fr-FR")}`}</span></div>
    <div className="flex min-h-36 flex-col items-center justify-center gap-3 bg-secondary/20 p-6"><Lock className="size-10" aria-hidden="true" /><p className="text-center text-sm font-semibold [overflow-wrap:anywhere]">{card.sport}</p></div>
    <div className="flex flex-1 flex-col gap-3 p-4 text-foreground">
      <h3 className="text-lg font-semibold [overflow-wrap:anywhere]">{card.name}</h3>
      <p className="text-sm text-muted-foreground [overflow-wrap:anywhere]">{card.editionName}</p>
      {card.discovered
        ? <dl className="mt-auto flex flex-wrap justify-between gap-3 text-xs"><div><dt className="text-muted-foreground">Nationalité</dt><dd className="mt-1 [overflow-wrap:anywhere]">{card.nationality ?? "Non renseignée"}</dd></div><div><dt className="text-muted-foreground">Prestige</dt><dd className="mt-1 font-semibold">{card.prestigeScore?.toLocaleString("fr-FR")} / 100</dd></div></dl>
        : <p className="mt-auto text-xs text-muted-foreground">Obtenez cette carte pour débloquer sa fiche.</p>}
      <p className="text-xs text-muted-foreground">{card.discovered ? "Déjà obtenue, plus dans votre collection" : "Jamais obtenue"} · <Link href={`/athletes/${card.athleteId}`} className="text-primary hover:underline">Voir la fiche</Link></p>
    </div>
  </article>;
}
