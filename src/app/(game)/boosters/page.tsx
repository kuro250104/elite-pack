import Link from "next/link";
import { requireUser } from "@/lib/auth/authorization";
import { getGameCatalogue, getPlayerBoosters } from "@/server/game/catalog";
import { BoosterPanel } from "@/components/boosters/booster-panel";
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
    const snapshot = await getPlayerBoosters(user.id);
    const initial = { ...catalogue, passive: { stock: snapshot.stock, maxStock: snapshot.maxStock, intervalSeconds: snapshot.intervalSeconds, nextGenerationAt: snapshot.nextGenerationAt, serverTime: snapshot.serverTime }, welcomeAvailable: snapshot.welcomeAvailable, welcomeClaimed: snapshot.welcomeClaimed };
    return <main id="contenu" className="mx-auto min-w-0 max-w-6xl space-y-8 px-5 pb-12 sm:px-8"><GameNav /><header className="space-y-3"><h1 className="text-3xl font-bold">Ouvrez votre prochain booster</h1><p className="max-w-3xl text-muted-foreground">Choisissez un sport et découvrez {catalogue.cardCount} cartes. Vos nouvelles cartes rejoignent directement votre collection. Les doublons sont autorisés.</p><p className="text-sm text-muted-foreground">Catalogue découverte : football et sports automobiles, avec plusieurs éditions de Kylian Mbappé et Lewis Hamilton. Les portraits ne sont pas encore affichés.</p></header><BoosterPanel initial={initial}/></main>;
}
