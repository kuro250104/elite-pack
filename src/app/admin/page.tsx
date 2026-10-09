import Link from "next/link";
import { requireAdmin } from "@/lib/auth/authorization";
import { Button } from "@/components/ui/button";
export default async function AdminPage() {
  await requireAdmin();
  return <main id="contenu" className="mx-auto max-w-5xl space-y-6 px-5 py-12">
    <Link href="/dashboard" className="text-sm text-primary hover:underline">Retour au tableau de bord</Link>
    <h1 className="text-3xl font-bold">Administration</h1>
    <p className="max-w-2xl text-muted-foreground">Préparez le catalogue multisport et vérifiez les identités importées depuis TheSportsDB.</p>
    <Button asChild><Link href="/admin/imports">Gérer les imports et le catalogue</Link></Button>
  </main>;
}
