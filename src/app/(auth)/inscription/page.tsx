import Link from "next/link";
import { signIn } from "@/lib/auth";
import { RegisterForm } from "@/components/auth/register-form";
import { Button } from "@/components/ui/button";

export default function RegisterPage() {
  const configured = Boolean(process.env.AUTH_GITHUB_ID && process.env.AUTH_GITHUB_SECRET);
  return <main id="contenu" className="mx-auto max-w-lg px-6 py-16 sm:py-24">
    <Link href="/" className="text-sm text-muted-foreground hover:underline">← Accueil</Link>
    <h1 className="mt-8 text-3xl font-bold">Créer un compte</h1>
    <p className="my-6 text-muted-foreground">Choisissez un nom et vos identifiants pour commencer votre collection multisport.</p>
    <RegisterForm />
    <p className="mt-6 text-sm text-muted-foreground">Déjà un compte ? <Link href="/connexion" className="text-primary underline underline-offset-4">Se connecter</Link></p>
    {configured && <div className="mt-8 border-t pt-6"><p className="mb-4 text-sm text-muted-foreground">Vous pouvez également créer votre compte avec GitHub.</p><form action={async () => {"use server"; await signIn("github", {redirectTo: "/dashboard"});}}><Button type="submit" variant="outline" className="w-full">Continuer avec GitHub</Button></form></div>}
  </main>;
}
