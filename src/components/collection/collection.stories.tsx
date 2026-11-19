import type { Story, StoryDefault } from "@ladle/react";
import type { MissingCardView } from "@/server/collection/service";
import { CollectionProgress } from "./collection-progress";
import { MissingCard } from "./missing-card";

const meta: StoryDefault = { title: "Collection" };
export default meta;

const missing: MissingCardView = {
  editionId: "edition-9", athleteId: "athlete-9", name: "Lewis Hamilton", sport: "Formule 1", rarity: "MYTHIC",
  editionName: "World Champion", discovered: false, nationality: null, prestigeScore: null, maxSupply: 50,
};

export const CarteJamaisObtenue: Story = () => <div className="max-w-xs"><MissingCard card={missing} /></div>;
CarteJamaisObtenue.storyName = "Carte manquante, jamais obtenue";

export const CarteDejaDecouverte: Story = () => <div className="max-w-xs">
  <MissingCard card={{ ...missing, rarity: "RARE", editionName: "Silver", discovered: true, nationality: "Royaume-Uni", prestigeScore: 97, maxSupply: null }} />
</div>;
CarteDejaDecouverte.storyName = "Carte manquante, déjà découverte";

export const Progression: Story = () => <CollectionProgress progress={{ owned: 37, total: 120, sports: [
  { sportId: "football", sport: "Football", owned: 21, total: 48 },
  { sportId: "f1", sport: "Formule 1", owned: 12, total: 20 },
  { sportId: "rugby", sport: "Rugby", owned: 4, total: 52 },
] }} />;
Progression.storyName = "Progression par sport";
