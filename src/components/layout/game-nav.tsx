import Link from "next/link";

export function GameNav() {
  return <nav aria-label="Navigation du jeu" className="flex flex-wrap gap-x-6 gap-y-3 border-b py-5 text-sm font-medium"><Link href="/dashboard" className="text-primary hover:underline">Tableau de bord</Link><Link href="/boosters" className="text-primary hover:underline">Boosters</Link><Link href="/collection" className="text-primary hover:underline">Collection</Link></nav>;
}
