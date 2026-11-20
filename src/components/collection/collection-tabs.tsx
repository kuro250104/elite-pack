import Link from "next/link";
import { cn } from "@/lib/utils";

const tabs = [
  ["owned", "Mes cartes", "/collection"],
  ["missing", "Cartes manquantes", "/collection?status=missing"],
  ["wishlist", "Liste de souhaits", "/collection/souhaits"],
] as const;

type CollectionTab = typeof tabs[number][0];

export function CollectionTabs({ current, links }: {
  current: CollectionTab;
  links?: Partial<Record<CollectionTab, string>>;
}) {
  return <nav aria-label="Affichage de la collection" className="flex flex-wrap gap-2">
    {tabs.map(([tab, label, href]) => <Link key={tab} href={links?.[tab] ?? href}
      aria-current={current === tab ? "page" : undefined}
      className={cn("rounded-md border px-4 py-2 text-sm font-medium",
        current === tab ? "bg-primary text-primary-foreground" : "hover:bg-secondary")}
    >{label}</Link>)}
  </nav>;
}
