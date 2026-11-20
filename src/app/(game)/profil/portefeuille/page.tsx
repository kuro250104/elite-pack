import Link from "next/link";
import { notFound } from "next/navigation";
import { WalletTransactionRow } from "@/components/economy/wallet-transaction-row";
import { GameNav } from "@/components/layout/game-nav";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api/errors";
import { requireUser } from "@/lib/auth/authorization";
import { formatCoins } from "@/lib/currency";
import { getWalletHistory, walletHistoryQuerySchema, walletTransactionLabels } from "@/server/wallet/history";

export default async function WalletPage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  const { page, pageSize, type } = await searchParams;
  const parsed = walletHistoryQuerySchema.safeParse({ page, pageSize, type: type === "" ? undefined : type });
  const query = parsed.success ? parsed.data : walletHistoryQuerySchema.parse({});
  const history = await getWalletHistory(user.id, query).catch((error: unknown) => {
    if (error instanceof ApiError && error.code === "WALLET_NOT_FOUND") notFound();
    throw error;
  });
  const href = (targetPage: number) => {
    const parameters = new URLSearchParams({ page: String(targetPage), pageSize: String(history.pageSize) });
    if (query.type) parameters.set("type", query.type);
    return `/profil/portefeuille?${parameters}`;
  };

  const totals = [
    ["Solde", history.balance],
    ["Gagné au total", history.lifetimeEarnings],
    ["Dépensé au total", history.lifetimeSpending],
  ] as const;

  return <main id="contenu" className="mx-auto min-w-0 max-w-5xl space-y-8 px-5 pb-12 sm:px-8">
    <GameNav />
    <Link href="/profil" className="text-sm text-muted-foreground hover:underline">← Mon profil</Link>
    <h1 className="text-3xl font-bold">Mon portefeuille</h1>
    <dl className="grid gap-4 sm:grid-cols-3">
      {totals.map(([label, value]) => <div key={label} className="min-w-0 rounded-xl border bg-card p-5">
        <dt className="text-sm text-muted-foreground">{label}</dt>
        <dd className="mt-2 text-2xl font-semibold tabular-nums [overflow-wrap:anywhere]">{formatCoins(BigInt(value))}</dd>
      </div>)}
    </dl>

    <section aria-labelledby="wallet-history-title" className="space-y-4">
      <h2 id="wallet-history-title" className="text-xl font-semibold">Historique des transactions</h2>
      <form action="/profil/portefeuille" className="flex flex-wrap items-end gap-3">
        <input name="pageSize" type="hidden" value={history.pageSize} />
        <div className="min-w-0 space-y-2">
          <label htmlFor="wallet-type" className="block text-sm">Type</label>
          <select id="wallet-type" name="type" defaultValue={query.type ?? ""} className="field-select max-w-full">
            <option value="">Tous les types</option>
            {Object.entries(walletTransactionLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </div>
        <Button type="submit">Filtrer</Button>
      </form>
      {history.transactions.length === 0
        ? <p className="rounded-xl border border-dashed p-6 text-muted-foreground">Aucune transaction pour cette sélection.</p>
        : <ol className="space-y-2">
          {history.transactions.map((transaction) => <WalletTransactionRow key={transaction.id} transaction={transaction} />)}
        </ol>}
      {(history.page > 1 || history.page * history.pageSize < history.total) && <nav aria-label="Pagination des transactions" className="flex flex-wrap gap-4 text-sm">
        {history.page > 1 && <Link href={href(history.page - 1)} className="text-primary hover:underline">Précédent</Link>}
        <span>Page {history.page.toLocaleString("fr-FR")}</span>
        {history.page < 10000 && history.page * history.pageSize < history.total && <Link href={href(history.page + 1)} className="text-primary hover:underline">Suivant</Link>}
      </nav>}
    </section>
  </main>;
}
