import Link from "next/link";
import { notFound } from "next/navigation";
import { Lock } from "lucide-react";
import { requireUser } from "@/lib/auth/authorization";
import { ApiError } from "@/lib/api/errors";
import { cn } from "@/lib/utils";
import { getAthleteSheet } from "@/server/athletes/encyclopedia";
import { wishlistedEditionIds } from "@/server/wishlist/service";
import { WishlistButton } from "@/components/collection/wishlist-button";
import { rarityPresentation } from "@/components/cards/athlete-card";
import { ApprovedPortrait } from "@/components/athletes/athlete-portrait";
import { GameNav } from "@/components/layout/game-nav";
import { Button } from "@/components/ui/button";

async function loadSheet(actorId: string, id: string) {
  try { return await getAthleteSheet(actorId, id); }
  catch (error) { if (error instanceof ApiError && error.code === "ATHLETE_NOT_FOUND") notFound(); throw error; }
}

function List({ title, entries }: { title: string; entries: string[] }) {
  if (!entries.length) return null;
  return <section className="space-y-2"><h3 className="font-semibold">{title}</h3><ul className="list-disc space-y-1 pl-5 text-sm">{entries.map((entry) => <li key={entry} className="[overflow-wrap:anywhere]">{entry}</li>)}</ul></section>;
}

export default async function AthletePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const sheet = await loadSheet(user.id, id);
  const wishlisted = await wishlistedEditionIds(user.id, sheet.editions.filter((edition) => edition.owned === 0).map((edition) => edition.id));
  const identity: [string, string | null][] = [["Sport", sheet.sport], ["Nationalité", sheet.nationality], ["Équipe", sheet.currentTeam],
    ["Poste", sheet.position], ["Prestige", `${sheet.prestigeScore.toLocaleString("fr-FR")} / 100`]];
  const owned = sheet.editions.filter((edition) => edition.owned > 0).length;
  return <main id="contenu" className="mx-auto min-w-0 max-w-5xl space-y-8 px-5 pb-12 sm:px-8"><GameNav />
    <Link href="/athletes" className="text-sm text-muted-foreground hover:underline">← Encyclopédie</Link>
    <div className="grid gap-8 md:grid-cols-[minmax(0,18rem)_minmax(0,1fr)]">
      <ApprovedPortrait name={sheet.name} image={sheet.image} />
      <div className="min-w-0 space-y-6">
        <header><h1 className="text-3xl font-bold [overflow-wrap:anywhere]">{sheet.name}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{sheet.unlocked ? "Fiche débloquée" : "Fiche verrouillée"}{sheet.syncedAt ? ` · Données TheSportsDB du ${new Date(sheet.syncedAt).toLocaleDateString("fr-FR", { dateStyle: "long", timeZone: "Europe/Paris" })}` : ""}</p></header>
        <dl className="grid gap-4 sm:grid-cols-2">{identity.map(([label, value]) => <div key={label}><dt className="text-sm text-muted-foreground">{label}</dt><dd className="mt-1 [overflow-wrap:anywhere]">{value ?? "Non renseigné"}</dd></div>)}
          {sheet.details && <div><dt className="text-sm text-muted-foreground">Date de naissance</dt><dd className="mt-1">{sheet.details.birthDate
            ? new Date(`${sheet.details.birthDate}T00:00:00Z`).toLocaleDateString("fr-FR", { dateStyle: "long", timeZone: "UTC" }) : "Non renseignée"}</dd></div>}
        </dl>
      </div>
    </div>

    <section aria-labelledby="details-title" className="space-y-4 rounded-xl border bg-card p-5">
      <h2 id="details-title" className="text-xl font-semibold">Biographie et palmarès</h2>
      {sheet.details
        ? <div className="space-y-5">
            <p className="whitespace-pre-line text-sm leading-relaxed [overflow-wrap:anywhere]">{sheet.details.biography ?? "Aucune biographie en français n’est disponible pour cet athlète."}</p>
            <List title="Palmarès" entries={sheet.details.achievements} />
            <List title="Statistiques" entries={sheet.details.statistics} />
          </div>
        : <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center"><Lock className="size-8 shrink-0 text-muted-foreground" aria-hidden="true" />
            <p className="text-sm text-muted-foreground">Obtenez une carte de {sheet.name} pour débloquer sa biographie, son palmarès et ses statistiques.</p>
            <Button asChild className="sm:ml-auto"><Link href="/boosters">Ouvrir un booster</Link></Button></div>}
    </section>

    <section aria-labelledby="editions-title" className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2"><h2 id="editions-title" className="text-xl font-semibold">Éditions</h2>
        <p className="text-sm text-muted-foreground">{owned} / {sheet.editions.length} possédée{owned > 1 ? "s" : ""}</p></div>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {sheet.editions.map((edition) => <li key={edition.id} className={cn("rounded-lg border p-4", rarityPresentation[edition.rarity].className, edition.owned === 0 && "border-dashed opacity-80")}>
          <p className="text-xs">{rarityPresentation[edition.rarity].name}</p>
          <p className="mt-1 font-semibold text-foreground [overflow-wrap:anywhere]">{edition.name}</p>
          <p className="mt-2 text-xs text-muted-foreground">{edition.owned > 0 ? `${edition.owned} exemplaire${edition.owned > 1 ? "s" : ""} possédé${edition.owned > 1 ? "s" : ""}` : edition.discovered ? "Déjà obtenue, plus possédée" : "Manquante"}
            {edition.maxSupply !== null && ` · Tirage limité à ${edition.maxSupply.toLocaleString("fr-FR")}`}{edition.soldOut ? " · Épuisée" : ""}{!edition.obtainable ? " · Plus disponible en booster" : ""}</p>
          {edition.owned === 0 && (edition.obtainable || wishlisted.has(edition.id)) && <div className="mt-3">
            <WishlistButton editionId={edition.id} wishlisted={wishlisted.has(edition.id)} />
          </div>}
        </li>)}
      </ul>
      {sheet.editions.length === 0 && <p className="text-sm text-muted-foreground">Aucune édition n’est encore disponible pour cet athlète.</p>}
    </section>
  </main>;
}
