import type { Story, StoryDefault } from "@ladle/react";
import { BoosterPanel, type BoosterPanelInitial } from "./booster-panel";

const meta: StoryDefault = { title: "Boosters / Panneau des boosters gratuits" };
export default meta;

// Ladle has no API: opening a booster shows the panel's error state, which these stories also document.
function initial(stock: number, overrides: Partial<BoosterPanelInitial> = {}): BoosterPanelInitial {
  return {
    boosterTypeId: "discovery-booster", cardCount: 5,
    sports: [{ id: "football", nameFr: "Football" }, { id: "basketball", nameFr: "Basketball" }, { id: "tennis", nameFr: "Tennis" }],
    weights: [
      { rarity: "COMMON", weightBasisPoints: 5500 }, { rarity: "UNCOMMON", weightBasisPoints: 2500 }, { rarity: "RARE", weightBasisPoints: 1200 },
      { rarity: "EPIC", weightBasisPoints: 500 }, { rarity: "LEGENDARY", weightBasisPoints: 250 }, { rarity: "MYTHIC", weightBasisPoints: 50 },
    ],
    passive: { stock, maxStock: 10, intervalSeconds: 900, serverTime: new Date().toISOString(),
      nextGenerationAt: stock >= 10 ? null : new Date(Date.now() + 522_000).toISOString() },
    welcomeAvailable: 0, welcomeClaimed: true, ...overrides,
  };
}

export const StockPartiel: Story = () => <BoosterPanel initial={initial(7)} />;
StockPartiel.storyName = "Stock partiel (7 / 10)";

export const StockPlein: Story = () => <BoosterPanel initial={initial(10)} />;
StockPlein.storyName = "Stock plein (10 / 10)";

export const StockVide: Story = () => <BoosterPanel initial={initial(0)} />;
StockVide.storyName = "Stock vide : ouverture désactivée";

export const BienvenueDisponible: Story = () => <BoosterPanel initial={initial(0, { welcomeAvailable: 1, welcomeClaimed: false })} />;
BienvenueDisponible.storyName = "Nouveau joueur : booster de bienvenue";
