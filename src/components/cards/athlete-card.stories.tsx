import type { Story, StoryDefault } from "@ladle/react";
import { AthleteCard, rarityPresentation, type CardRarity, type CardView } from "./athlete-card";

const meta: StoryDefault = { title: "Cartes / Carte d’athlète" };
export default meta;

const base: CardView = {
  instanceId: "instance-1", editionId: "edition-1", athleteId: "athlete-1", name: "Kylian Mbappé", sport: "Football",
  rarity: "COMMON", editionName: "Standard", nationality: "France", prestigeScore: 92, serialNumber: null, maxSupply: null,
  acquiredAt: "2026-11-17T09:30:00.000Z",
};
const editions: Record<CardRarity, string> = {
  COMMON: "Standard", UNCOMMON: "Bronze", RARE: "Silver", EPIC: "Champions", LEGENDARY: "Golden", MYTHIC: "World Champion",
};
const limitedSupply: Partial<Record<CardRarity, number>> = { EPIC: 5000, LEGENDARY: 500, MYTHIC: 50 };
const rarities = Object.keys(rarityPresentation) as CardRarity[];

/** Les six raretés : la couleur accompagne toujours le nom français, jamais seule. */
export const ToutesLesRaretes: Story = () => <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
  {rarities.map((rarity) => <AthleteCard key={rarity} card={{ ...base, instanceId: rarity, rarity, editionName: editions[rarity],
    serialNumber: limitedSupply[rarity] ? 42 : null, maxSupply: limitedSupply[rarity] ?? null }} />)}
</div>;
ToutesLesRaretes.storyName = "Les six raretés";

export const EditionLimitee: Story = () => <div className="max-w-xs">
  <AthleteCard card={{ ...base, rarity: "LEGENDARY", editionName: "Golden", serialNumber: 42, maxSupply: 500 }} />
</div>;
EditionLimitee.storyName = "Édition limitée numérotée";

export const DonneesIncompletes: Story = () => <div className="max-w-xs">
  <AthleteCard card={{ ...base, name: "Giannis Antetokounmpo-Papadopoulos", sport: "Basketball", nationality: null, prestigeScore: 0, acquiredAt: undefined }} />
</div>;
DonneesIncompletes.storyName = "Données incomplètes et nom long";

type Controls = { rarity: CardRarity; name: string; prestigeScore: number; serialNumber: number };
export const Parametrable: Story<Controls> = ({ rarity, name, prestigeScore, serialNumber }) => <div className="max-w-xs">
  <AthleteCard card={{ ...base, rarity, name, prestigeScore,
    serialNumber: serialNumber > 0 ? serialNumber : null, maxSupply: serialNumber > 0 ? 500 : null }} />
</div>;
Parametrable.storyName = "Carte paramétrable";
Parametrable.args = { name: "Kylian Mbappé", prestigeScore: 92, serialNumber: 0 };
Parametrable.argTypes = { rarity: { options: rarities, control: { type: "select" }, defaultValue: "RARE" } };
