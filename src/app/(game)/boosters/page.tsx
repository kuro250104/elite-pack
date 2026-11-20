import Link from "next/link";
import { requireUser } from "@/lib/auth/authorization";
import { getGameCatalogue, getPlayerBoosters } from "@/server/game/catalog";
import { BoosterPanel } from "@/components/boosters/booster-panel";
import { EventBoosters } from "@/components/boosters/event-boosters";
import { listEvents } from "@/server/boosters/events";
import { GameNav } from "@/components/layout/game-nav";
import { ApiError } from "@/lib/api/errors";
export default async function BoostersPage() {
    const user = await requireUser();
    let catalogue: Awaited<ReturnType<typeof getGameCatalogue>>;
    try {
        catalogue = await getGameCatalogue();
    }
    catch (error) {
        if (!(error instanceof ApiError))
            throw error;
        return <main id="contenu" className="mx-auto max-w-5xl px-5 pb-12"><GameNav /><h1 className="mt-10 text-3xl font-bold">Boosters</h1><p className="mt-5 text-muted-foreground">Le catalogue n’est pas encore disponible. Vos boosters gratuits continuent de s’accumuler.</p><Link href="/dashboard" className="mt-5 inline-block text-primary underline">Retour au tableau de bord</Link></main>;
    }
    const [snapshot, events] = await Promise.all([getPlayerBoosters(user.id), listEvents(user.id)]);
    const initial = { ...catalogue, passive: { stock: snapshot.stock, maxStock: snapshot.maxStock, intervalSeconds: snapshot.intervalSeconds, nextGenerationAt: snapshot.nextGenerationAt, serverTime: snapshot.serverTime }, welcomeAvailable: snapshot.welcomeAvailable, welcomeClaimed: snapshot.welcomeClaimed };
    return <main id="contenu" className="mx-auto min-w-0 max-w-6xl space-y-8 px-5 pb-12 sm:px-8"><GameNav /><header className="space-y-3"><h1 className="text-3xl font-bold">Ouvrez votre prochain booster</h1><p className="max-w-3xl text-muted-foreground">Choisissez un sport et découvrez {catalogue.cardCount} cartes. Vos nouvelles cartes rejoignent directement votre collection. Les doublons sont autorisés.</p><p className="text-sm text-muted-foreground">Les portraits affichés sont sous licence libre, avec le crédit de leur auteur ; les autres athlètes gardent un visuel de remplacement.</p><Link href="/boosters/historique" className="inline-block text-sm text-primary underline">Voir l’historique de mes ouvertures</Link></header><BoosterPanel initial={initial}/><EventBoosters events={events.events} serverTime={events.serverTime}/></main>;
}
