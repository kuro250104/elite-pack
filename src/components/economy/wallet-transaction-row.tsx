import { formatCoins } from "@/lib/currency";
import { cn } from "@/lib/utils";
import type { WalletHistoryEntry } from "@/server/wallet/history";

const transactionDate = new Intl.DateTimeFormat("fr-FR", {
  dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Paris",
});

export function WalletTransactionRow({ transaction }: { transaction: WalletHistoryEntry }) {
  const amount = BigInt(transaction.amount);
  return <li className="grid min-w-0 gap-3 rounded-lg border bg-card p-4 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)] sm:items-center">
    <div className="[overflow-wrap:anywhere]">
      <p className="font-semibold">{transaction.label}</p>
      {transaction.detail && <p className="text-sm text-muted-foreground">{transaction.detail}</p>}
    </div>
    <dl className="grid grid-cols-2 gap-2 sm:grid-cols-1">
      <div className="min-w-0 [overflow-wrap:anywhere]">
        <dt className="text-xs text-muted-foreground">Montant</dt>
        <dd className={cn("font-semibold tabular-nums", amount > 0n && "text-emerald-400", amount < 0n && "text-red-400")}>
          {amount > 0n && "+"}{formatCoins(amount)}
        </dd>
      </div>
      <div className="min-w-0 [overflow-wrap:anywhere]">
        <dt className="text-xs text-muted-foreground">Solde après</dt>
        <dd className="text-sm font-medium tabular-nums">{formatCoins(BigInt(transaction.balanceAfter))}</dd>
      </div>
    </dl>
    <time className="text-sm text-muted-foreground" dateTime={transaction.createdAt}>
      {transactionDate.format(new Date(transaction.createdAt))}
    </time>
  </li>;
}
