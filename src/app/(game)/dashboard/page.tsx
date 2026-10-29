import Link from "next/link";
import { requireUser } from "@/lib/auth/authorization";
import { signOut } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { GameNav } from "@/components/layout/game-nav";
import { getPlayerBoosters } from "@/server/game/catalog";
import { db } from "@/lib/db/prisma";
export default async function DashboardPage() {
    const user = await requireUser();
    const [snapshot, cards] = await Promise.all([getPlayerBoosters(user.id), db.cardInstance.count({ where: { ownerId: user.id, retiredAt: null } })]);
    return <main id="contenu" className="mx-auto max-w-5xl space-y-8 px-5 pb-12"><GameNav /><header><h1 className="text-3xl font-bold">Bienvenue, {user.name ?? "athlète"}</h1><p className="mt-4 text-muted-foreground">Choisissez votre sport, ouvrez un booster et commencez votre collection.</p></header><div className="grid gap-4 sm:grid-cols-3"><div className="rounded-xl border bg-card p-6"><p className="text-muted-foreground">Boosters gratuits</p><p className="mt-2 text-3xl font-semibold">{snapshot.stock} / {snapshot.maxStock}</p></div><div className="rounded-xl border bg-card p-6"><p className="text-muted-foreground">Cartes dans ma collection</p><p className="mt-2 text-3xl font-semibold">{cards.toLocaleString("fr-FR")}</p></div><div className="rounded-xl border bg-card p-6"><p className="text-muted-foreground">Booster de bienvenue</p><p className="mt-2 font-semibold">{snapshot.welcomeAvailable > 0 ? "Prêt à ouvrir" : snapshot.welcomeClaimed ? "Déjà utilisé" : "À récupérer gratuitement"}</p></div></div><div className="flex flex-wrap gap-3"><Button asChild size="lg"><Link href="/boosters">Jouer — ouvrir mes boosters</Link></Button><Button asChild variant="outline" size="lg"><Link href="/collection">Voir ma collection</Link></Button>{user.role === "ADMIN" && <Button asChild variant="outline"><Link href="/admin">Administration</Link></Button>}</div><form action={async () => {
        "use server";
        await signOut({ redirectTo: "/" });
    }}><Button type="submit" variant="ghost">Se déconnecter</Button></form></main>;
}
