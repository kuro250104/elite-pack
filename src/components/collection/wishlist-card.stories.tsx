import type { Story, StoryDefault } from "@ladle/react";
import { Button } from "@/components/ui/button";
import type { WishlistCardView } from "@/server/wishlist/service";
import { WishlistCard } from "./wishlist-card";

const meta: StoryDefault = { title: "Collection" };
export default meta;

const card: WishlistCardView = {
  editionId: "edition-1", athleteId: "athlete-1", name: "Lewis Hamilton", sport: "Formule 1",
  rarity: "LEGENDARY", editionName: "Champion du monde", maxSupply: 500,
  owned: false, activeListings: 0, addedAt: "2026-11-20T09:00:00.000Z",
};

function Example({ item }: { item: WishlistCardView }) {
  return <div className="max-w-xs"><WishlistCard card={item} action={
    <Button size="sm" variant="outline" aria-pressed disabled>Retirer de ma liste de souhaits</Button>
  } /></div>;
}

export const SouhaitManquant: Story = () => <Example item={card} />;
export const SouhaitPossede: Story = () => <Example item={{ ...card, owned: true }} />;
export const SouhaitSurLeMarche: Story = () => <Example item={{ ...card, activeListings: 3 }} />;
