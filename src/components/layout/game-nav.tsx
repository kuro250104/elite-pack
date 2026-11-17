import Link from "next/link";
import { Coins } from "lucide-react";
import { requireUser } from "@/lib/auth/authorization";
import { formatCoins } from "@/lib/currency";
import { getWalletBalance } from "@/server/players/profile";

export async function GameNav() {
  const user = await requireUser();
  const balance = await getWalletBalance(user.id);
  return <nav aria-label="Navigation du jeu" className="flex flex-wrap items-center gap-x-6 gap-y-3 border-b py-5 text-sm font-medium">
    <Link href="/dashboard" className="text-primary hover:underline">Tableau de bord</Link>
    <Link href="/boosters" className="text-primary hover:underline">Boosters</Link>
    <Link href="/collection" className="text-primary hover:underline">Collection</Link>
    <Link href="/athletes" className="text-primary hover:underline">Athlètes</Link>
    <Link href="/profil" className="text-primary hover:underline">Mon profil</Link>
    <p className="ml-auto flex items-center gap-2 text-foreground" aria-label={`Solde : ${formatCoins(balance)}`}>
      <Coins className="size-4 text-rarity-legendary" aria-hidden="true" />{formatCoins(balance)}
    </p>
  </nav>;
}
