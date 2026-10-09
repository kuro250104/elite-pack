import Link from "next/link";
import { ArrowRight, Layers3, ShieldCheck, Sparkles, Trophy } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const principles = [
  { icon: Layers3, title: "Tous les terrains, une collection", description: "Des athlètes de plusieurs disciplines, avec des éditions à collectionner et des exemplaires uniques." },
  { icon: Sparkles, title: "Le plaisir de la découverte", description: "Des boosters gratuits et le choix du sport à chaque ouverture. Les doublons font partie de la collection." },
  { icon: ShieldCheck, title: "Des règles transparentes", description: "Des probabilités publiées et des éditions limitées dont la quantité est contrôlée." },
];

export default function Home() {
  return (
    <div className="mx-auto max-w-6xl px-5 sm:px-8">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b py-6">
        <Link href="/" className="inline-flex items-center gap-3 text-lg font-bold tracking-tight" aria-label="Elite Pack, accueil">
          <Trophy className="size-6 text-primary" aria-hidden="true" /> ELITE PACK
        </Link>
        <nav aria-label="Navigation principale">
          <Button asChild variant="outline" size="sm"><Link href="/connexion">Se connecter</Link></Button>
        </nav>
      </header>
      <main id="contenu" className="py-16 sm:py-24">
        <section aria-labelledby="titre-accueil" className="max-w-3xl">
          <Badge variant="outline" className="mb-6 text-muted-foreground">Le jeu est en préparation</Badge>
          <p className="mb-4 text-xs font-semibold tracking-[0.2em] text-primary uppercase">Le sport à collectionner</p>
          <h1 id="titre-accueil" className="text-4xl leading-[1.12] font-bold tracking-tight sm:text-6xl">Une passion.<br />Des milliers de cartes.</h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted-foreground">Collectionnez les athlètes qui vous inspirent. Découvrez leurs éditions, composez votre collection et partagez votre passion du sport.</p>
          <p className="mt-4 max-w-xl text-sm leading-relaxed text-muted-foreground">Les fondations sont en cours de développement. L’ouverture des boosters et le marché seront disponibles lors d’une prochaine étape.</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild size="lg"><Link href="/inscription">Créer mon compte <ArrowRight aria-hidden="true" /></Link></Button>
            <Button asChild variant="ghost" size="lg"><a href="#principes">Découvrir le projet</a></Button>
          </div>
        </section>
        <section id="principes" aria-labelledby="titre-principes" className="mt-20 sm:mt-28">
          <h2 id="titre-principes" className="mb-6 text-2xl font-semibold tracking-tight">Pensé pour les collectionneurs</h2>
          <div className="grid gap-4 md:grid-cols-3">
            {principles.map(({ icon: Icon, title, description }) => (
              <Card key={title}>
                <CardHeader>
                  <Icon className="mb-4 size-6 text-primary" aria-hidden="true" />
                  <CardTitle className="text-lg">{title}</CardTitle>
                  <CardDescription>{description}</CardDescription>
                </CardHeader>
              </Card>
            ))}
          </div>
        </section>
      </main>
      <footer className="border-t py-6 text-sm text-muted-foreground">Elite Pack · Jeu de cartes multisport · Entièrement en français</footer>
    </div>
  );
}
