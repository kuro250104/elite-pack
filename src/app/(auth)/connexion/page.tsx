import Link from "next/link";
import { signIn } from "@/lib/auth";
import { Button } from "@/components/ui/button";
export default function SignInPage() {
  const configured = Boolean(process.env.AUTH_GITHUB_ID && process.env.AUTH_GITHUB_SECRET);
  return <main id="contenu" className="mx-auto max-w-lg px-6 py-24"><Link href="/" className="text-sm text-muted-foreground">← Accueil</Link><h1 className="mt-8 text-3xl font-bold">Connexion</h1><p className="my-6 text-muted-foreground">Connectez-vous pour retrouver votre collection multisport.</p>{configured ? <form action={async () => {"use server"; await signIn("github", {redirectTo: "/dashboard"});}}><Button type="submit">Continuer avec GitHub</Button></form> : <p role="status">La connexion sera disponible après la configuration du fournisseur d’authentification.</p>}</main>;
}
