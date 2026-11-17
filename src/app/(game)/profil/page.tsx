import Link from "next/link";
import { requireUser } from "@/lib/auth/authorization";
import { signOut } from "@/lib/auth";
import { formatCoins } from "@/lib/currency";
import { getPlayerProfile } from "@/server/players/profile";
import { getPassiveBoosters } from "@/server/boosters/passive";
import { rarityPresentation } from "@/components/cards/athlete-card";
import { GameNav } from "@/components/layout/game-nav";
import { Button } from "@/components/ui/button";

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return <div className="rounded-xl border bg-card p-5"><dt className="text-sm text-muted-foreground">{label}</dt><dd className="mt-2 text-2xl font-semibold">{value}</dd>{hint && <dd className="mt-1 text-xs text-muted-foreground">{hint}</dd>}</div>;
}

export default async function ProfilePage() {
  const user = await requireUser();
  const [profile, passive] = await Promise.all([getPlayerProfile(user.id), getPassiveBoosters(user.id)]);
  const number = (value: number) => value.toLocaleString("fr-FR");
  const memberSince = new Date(profile.memberSince).toLocaleDateString("fr-FR", { dateStyle: "long", timeZone: "Europe/Paris" });
  return <main id="contenu" className="mx-auto min-w-0 max-w-5xl space-y-8 px-5 pb-12 sm:px-8"><GameNav />
    <header className="space-y-2">
      <h1 className="text-3xl font-bold [overflow-wrap:anywhere]">{profile.name ?? "Mon profil"}</h1>
      <p className="text-muted-foreground [overflow-wrap:anywhere]">{profile.email} · Membre depuis le {memberSince}{profile.role === "ADMIN" ? " · Administrateur" : ""}</p>
    </header>

    <section aria-labelledby="wallet-title" className="space-y-4">
      <h2 id="wallet-title" className="text-xl font-semibold">Portefeuille</h2>
      <dl className="grid gap-4 sm:grid-cols-3">
        <Stat label="Solde" value={formatCoins(BigInt(profile.wallet.balance))} />
        <Stat label="Gagné au total" value={formatCoins(BigInt(profile.wallet.lifetimeEarnings))} />
        <Stat label="Dépensé au total" value={formatCoins(BigInt(profile.wallet.lifetimeSpending))} />
      </dl>
    </section>

    <section aria-labelledby="collection-title" className="space-y-4">
      <h2 id="collection-title" className="text-xl font-semibold">Collection</h2>
      <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Cartes possédées" value={number(profile.collection.cards)} hint="Doublons compris" />
        <Stat label="Éditions différentes" value={number(profile.collection.editions)} />
        <Stat label="Éditions découvertes" value={number(profile.collection.discoveredEditions)} hint="Y compris les cartes revendues" />
        <Stat label="Athlètes découverts" value={number(profile.collection.discoveredAthletes)} />
      </dl>
      <ul aria-label="Cartes possédées par rareté" className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {profile.collection.byRarity.map(({ rarity, count }) => <li key={rarity} className={`rounded-lg border p-3 text-center ${rarityPresentation[rarity].className}`}>
          <span className="block text-xs">{rarityPresentation[rarity].name}</span><span className="mt-1 block text-xl font-semibold text-foreground">{number(count)}</span>
        </li>)}
      </ul>
    </section>

    <section aria-labelledby="boosters-title" className="space-y-4">
      <h2 id="boosters-title" className="text-xl font-semibold">Boosters</h2>
      <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Boosters ouverts" value={number(profile.boosters.opened)} />
        <Stat label="Boosters gratuits reçus" value={number(profile.boosters.freeGenerated)} hint={`+1 toutes les ${Math.round(passive.intervalSeconds / 60).toLocaleString("fr-FR")} minutes`} />
        <Stat label="Boosters gratuits ouverts" value={number(profile.boosters.openedFromFreeStock)} />
        <Stat label="Stock actuel" value={`${passive.stock} / ${passive.maxStock}`} hint={passive.stock >= passive.maxStock ? "Stock plein" : undefined} />
      </dl>
    </section>

    <div className="flex flex-wrap gap-3">
      <Button asChild><Link href="/boosters">Ouvrir un booster</Link></Button>
      <form action={async () => { "use server"; await signOut({ redirectTo: "/" }); }}><Button type="submit" variant="ghost">Se déconnecter</Button></form>
    </div>
  </main>;
}
