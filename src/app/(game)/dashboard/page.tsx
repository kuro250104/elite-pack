import { requireUser } from "@/lib/auth/authorization";
import { signOut } from "@/lib/auth";
import { Button } from "@/components/ui/button";
export default async function DashboardPage() {const user = await requireUser(); return <main id="contenu" className="mx-auto max-w-4xl px-6 py-16"><h1 className="text-3xl font-bold">Bienvenue, {user.name ?? "athlète"}</h1><p className="my-6 text-muted-foreground">Votre espace de jeu est prêt. La collection, les boosters et le marché seront activés après validation de leurs règles.</p><form action={async () => {"use server"; await signOut({redirectTo: "/"});}}><Button type="submit" variant="outline">Se déconnecter</Button></form></main>;}
