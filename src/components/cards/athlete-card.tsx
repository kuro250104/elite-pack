import { Trophy } from "lucide-react";
import { cn } from "@/lib/utils";

export type CardRarity = "COMMON" | "UNCOMMON" | "RARE" | "EPIC" | "LEGENDARY" | "MYTHIC";
export type CardView = {
  instanceId: string; editionId: string; athleteId: string; name: string; sport: string;
  rarity: CardRarity; editionName: string; nationality: string | null; prestigeScore: number;
  serialNumber: number | null; maxSupply: number | null; acquiredAt: string;
};
export const rarityPresentation: Record<CardRarity, { name: string; className: string }> = {
  COMMON: { name: "Commune", className: "text-rarity-common border-rarity-common/50" },
  UNCOMMON: { name: "Peu commune", className: "text-rarity-uncommon border-rarity-uncommon/50" },
  RARE: { name: "Rare", className: "text-rarity-rare border-rarity-rare/50" },
  EPIC: { name: "Épique", className: "text-rarity-epic border-rarity-epic/50" },
  LEGENDARY: { name: "Légendaire", className: "text-rarity-legendary border-rarity-legendary/50" },
  MYTHIC: { name: "Mythique", className: "text-rarity-mythic border-rarity-mythic/50" },
};

export function AthleteCard({ card }: { card: CardView }) {
  const rarity = rarityPresentation[card.rarity];
  return <article className={cn("flex h-full min-w-0 flex-col overflow-hidden rounded-xl border bg-card", rarity.className)} aria-label={`${card.name}, ${card.editionName}, ${rarity.name}`}>
    <div className="flex items-center justify-between gap-3 border-b border-inherit px-4 py-3 text-xs"><span>{rarity.name}</span><span>{card.serialNumber === null ? "Édition non numérotée" : `Nº ${card.serialNumber.toLocaleString("fr-FR")}${card.maxSupply === null ? "" : ` / ${card.maxSupply.toLocaleString("fr-FR")}`}`}</span></div>
    <div className="flex min-h-36 flex-col items-center justify-center gap-3 bg-secondary/40 p-6"><Trophy className="size-12" aria-hidden="true" /><p className="text-center text-sm font-semibold [overflow-wrap:anywhere]">{card.sport}</p></div>
    <div className="flex flex-1 flex-col gap-3 p-4 text-foreground"><h3 className="text-lg font-semibold [overflow-wrap:anywhere]">{card.name}</h3><p className="text-sm text-muted-foreground [overflow-wrap:anywhere]">{card.editionName}</p><dl className="mt-auto flex flex-wrap justify-between gap-3 text-xs"><div><dt className="text-muted-foreground">Nationalité</dt><dd className="mt-1 [overflow-wrap:anywhere]">{card.nationality ?? "Non renseignée"}</dd></div><div><dt className="text-muted-foreground">Prestige</dt><dd className="mt-1 font-semibold">{card.prestigeScore.toLocaleString("fr-FR")} / 100</dd></div></dl><p className="text-xs text-muted-foreground">Obtenue le {new Date(card.acquiredAt).toLocaleDateString("fr-FR", { timeZone: "Europe/Paris" })}</p></div>
  </article>;
}
