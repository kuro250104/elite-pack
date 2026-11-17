import Link from "next/link";
import { requireAdmin } from "@/lib/auth/authorization";
import { formatCoins } from "@/lib/currency";
import { getAdminStats } from "@/server/admin/stats";
import { recentAdminChanges } from "@/server/admin/economy";
import { rarityPresentation } from "@/components/cards/athlete-card";
import { Button } from "@/components/ui/button";

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return <div className="rounded-xl border bg-card p-5"><dt className="text-sm text-muted-foreground">{label}</dt><dd className="mt-2 text-2xl font-semibold">{value}</dd>{hint && <dd className="mt-1 text-xs text-muted-foreground">{hint}</dd>}</div>;
}

export default async function AdminPage() {
  await requireAdmin();
  const [stats, changes] = await Promise.all([getAdminStats(), recentAdminChanges(undefined, undefined, 8)]);
  const n = (value: number | string) => Number(value).toLocaleString("fr-FR");
  const largest = Math.max(1, ...stats.cards.byRarity.map((row) => row.count));
  return <main id="contenu" className="mx-auto min-w-0 max-w-5xl space-y-8 px-5 py-12">
    <Link href="/dashboard" className="text-sm text-primary hover:underline">Retour au tableau de bord</Link>
    <header className="space-y-3"><h1 className="text-3xl font-bold">Administration</h1>
      <div className="flex flex-wrap gap-3">
        <Button asChild><Link href="/admin/economie">Règles économiques et boosters</Link></Button>
        <Button asChild variant="outline"><Link href="/admin/imports">Imports et catalogue</Link></Button>
        <Button asChild variant="outline"><Link href="/admin/images">Droits des images</Link></Button>
      </div>
    </header>

    <section aria-labelledby="stats-title" className="space-y-4">
      <h2 id="stats-title" className="text-xl font-semibold">Indicateurs</h2>
      <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Joueurs inscrits" value={n(stats.users)} />
        <Stat label="Athlètes" value={n(stats.athletes.total)} hint={`${n(stats.athletes.active)} actifs`} />
        <Stat label="Éditions" value={n(stats.editions.total)} hint={`${n(stats.editions.active)} actives`} />
        <Stat label="Cartes frappées" value={n(stats.cards.minted)} hint={`${n(stats.cards.inCirculation)} en circulation · ${n(stats.cards.retired)} retirées`} />
        <Stat label="Boosters gratuits générés" value={n(stats.boosters.passiveGenerated)} />
        <Stat label="Boosters ouverts" value={n(stats.boosters.opened)} hint={`dont ${n(stats.boosters.openedFromPassive)} gratuits`} />
        <Stat label="Ventes sur le marché" value={n(stats.marketplace.sales)} hint={`${formatCoins(BigInt(stats.marketplace.volume))} échangées · ${n(stats.marketplace.activeListings)} annonces actives`} />
        <Stat label="Reventes à la banque" value={n(stats.bank.sales)} hint={`${formatCoins(BigInt(stats.bank.paid))} versées`} />
      </dl>
    </section>

    <section aria-labelledby="rarity-title" className="space-y-4 rounded-xl border bg-card p-5">
      <h2 id="rarity-title" className="text-xl font-semibold">Cartes frappées par rareté</h2>
      <ul className="space-y-3">{stats.cards.byRarity.map(({ rarity, count }) => <li key={rarity} className="grid grid-cols-[7rem_minmax(0,1fr)_4rem] items-center gap-3 text-sm">
        <span className={rarityPresentation[rarity].className.split(" ")[0]}>{rarityPresentation[rarity].name}</span>
        <span className="h-3 overflow-hidden rounded-full bg-secondary" aria-hidden="true"><span className={`block h-full rounded-full bg-current ${rarityPresentation[rarity].className.split(" ")[0]}`} style={{ width: `${(count / largest) * 100}%` }} /></span>
        <span className="text-right tabular-nums">{n(count)}</span>
      </li>)}</ul>
    </section>

    <section aria-labelledby="changes-title" className="space-y-3">
      <h2 id="changes-title" className="text-xl font-semibold">Dernières modifications</h2>
      {changes.length === 0 ? <p className="text-sm text-muted-foreground">Aucune modification enregistrée.</p>
        : <ul className="divide-y rounded-xl border bg-card text-sm">{changes.map((change) => <li key={change.id} className="flex flex-wrap justify-between gap-2 p-3">
            <span>{change.label}</span><span className="text-muted-foreground">{change.actor} · {new Date(change.createdAt).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Paris" })}</span>
          </li>)}</ul>}
    </section>
  </main>;
}
