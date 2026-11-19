import type { Story, StoryDefault } from "@ladle/react";
import { rarityPresentation, type CardRarity } from "@/components/cards/athlete-card";
import { SportIcon } from "@/components/sports/sport-icon";
import { Badge } from "./badge";
import { Button } from "./button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "./card";
import { Input } from "./input";

const meta: StoryDefault = { title: "Design system" };
export default meta;

const rarities = Object.entries(rarityPresentation) as [CardRarity, { name: string; className: string }][];

export const Raretes: Story = () => <ul className="flex flex-wrap gap-3">
  {rarities.map(([rarity, { name, className }]) => <li key={rarity} className={`rounded-full border px-3 py-1 text-sm font-medium ${className}`}>{name}</li>)}
</ul>;
Raretes.storyName = "Couleurs des raretés";

export const Boutons: Story = () => <div className="flex flex-wrap items-center gap-3">
  <Button>Ouvrir un booster</Button>
  <Button variant="secondary">Choisir un sport</Button>
  <Button variant="outline">Voir la fiche</Button>
  <Button variant="ghost">Annuler</Button>
  <Button variant="destructive">Retirer l’annonce</Button>
  <Button variant="link">En savoir plus</Button>
  <Button disabled>Stock vide</Button>
  <Button size="sm">Petit</Button>
  <Button size="lg">Grand</Button>
</div>;
Boutons.storyName = "Boutons (cible tactile de 44 px)";

export const Badges: Story = () => <div className="flex flex-wrap gap-3">
  <Badge>Nouveau</Badge>
  <Badge variant="secondary">Football</Badge>
  <Badge variant="outline">Édition limitée</Badge>
  <Badge variant="destructive">Épuisée</Badge>
</div>;

export const ChampEnErreur: Story = () => <div className="grid max-w-sm gap-2">
  <label htmlFor="prix" className="text-sm font-medium">Prix de vente</label>
  <Input id="prix" inputMode="numeric" defaultValue="0" aria-invalid="true" aria-describedby="prix-erreur" />
  <p id="prix-erreur" className="text-sm text-destructive">Le prix doit être d’au moins 1 pièce.</p>
</div>;
ChampEnErreur.storyName = "Champ de formulaire en erreur";

export const Surface: Story = () => <Card className="max-w-sm">
  <CardHeader><CardTitle>Boosters gratuits</CardTitle><CardDescription>+1 booster toutes les 15 minutes</CardDescription></CardHeader>
  <CardContent><p className="text-3xl font-bold">7 / 10</p></CardContent>
  <CardFooter><Button>Ouvrir un booster</Button></CardFooter>
</Card>;
Surface.storyName = "Surface Card";

const sports = ["Football", "Formule 1", "Cyclisme", "Natation", "Boxe", "Volleyball", "Tennis", "Ski alpin", "Escalade", "Haltérophilie", "Tir à l’arc", "Athlétisme"];
export const IconesDeSport: Story = () => <ul className="grid grid-cols-2 gap-4 sm:grid-cols-4">
  {sports.map((nameFr) => <li key={nameFr} className="flex items-center gap-2 text-sm"><SportIcon nameFr={nameFr} icon={null} className="size-5 text-primary" />{nameFr}</li>)}
</ul>;
IconesDeSport.storyName = "Icônes de sport";
