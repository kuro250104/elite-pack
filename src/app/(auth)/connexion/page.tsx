import Link from "next/link";
import { signIn } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { LoginForm } from "@/components/auth/login-form";
export default async function SignInPage({ searchParams }: { searchParams: Promise<{ registered?: string; error?: string }> }) {
  const params = await searchParams;
  const configured = Boolean(process.env.AUTH_GITHUB_ID && process.env.AUTH_GITHUB_SECRET);
  return <main id="contenu" className="mx-auto max-w-lg px-6 py-16 sm:py-24">
    <Link href="/" className="text-sm text-muted-foreground hover:underline">← Accueil</Link>
    <h1 className="mt-8 text-3xl font-bold">Connexion</h1>
    <p className="my-6 text-muted-foreground">Connectez-vous pour retrouver votre collection multisport.</p>
    {params.registered === "1" && <p role="status" className="mb-6 rounded-md border p-4 text-sm text-primary">Votre demande d’inscription a été traitée. Connectez-vous avec votre adresse e-mail et votre mot de passe.</p>}
    <LoginForm initialError={Boolean(params.error)} />
    <p className="mt-6 text-sm text-muted-foreground">Pas encore de compte ? <Link href="/inscription" className="text-primary underline underline-offset-4">Créer mon compte</Link></p>
    {configured && <div className="mt-8 border-t pt-6"><p className="mb-4 text-sm text-muted-foreground">Vous pouvez également utiliser votre compte GitHub.</p><form action={async () => {"use server"; await signIn("github", {redirectTo: "/dashboard"});}}><Button type="submit" variant="outline" className="w-full">Continuer avec GitHub</Button></form></div>}
  </main>;
}
