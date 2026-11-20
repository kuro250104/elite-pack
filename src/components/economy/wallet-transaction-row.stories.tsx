import type { Story, StoryDefault } from "@ladle/react";
import type { WalletHistoryEntry } from "@/server/wallet/history";
import { WalletTransactionRow } from "./wallet-transaction-row";

const meta: StoryDefault = { title: "Portefeuille" };
export default meta;

const transaction: WalletHistoryEntry = {
  id: "example", type: "BANK_SALE", label: "Revente à la banque", detail: "Lewis Hamilton — Champion du monde",
  amount: "600", balanceAfter: "1600", createdAt: "2026-11-20T10:00:00.000Z",
};

function Example({ entry }: { entry: WalletHistoryEntry }) {
  return <ul className="max-w-2xl"><WalletTransactionRow transaction={entry} /></ul>;
}

export const Gain: Story = () => <Example entry={transaction} />;
export const Depense: Story = () => <Example entry={{
  ...transaction, type: "MARKETPLACE_PURCHASE", label: "Achat sur le marché", amount: "-500", balanceAfter: "1100",
}} />;
export const SoldeDeDepart: Story = () => <Example entry={{
  ...transaction, type: "INITIAL_BALANCE", label: "Solde de départ", detail: null, amount: "1000", balanceAfter: "1000",
}} />;
export const DetailAbsent: Story = () => <Example entry={{ ...transaction, detail: null }} />;
