import "server-only";
import { z } from "zod";
import type { PrismaClient } from "@/generated/prisma/client";
import { WalletTransactionType } from "@/generated/prisma/enums";
import { ApiError } from "@/lib/api/errors";
import { db } from "@/lib/db/prisma";

export const walletHistoryQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(10000).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
  type: z.enum(WalletTransactionType).optional(),
}).strict();

export const walletTransactionLabels: Record<WalletTransactionType, string> = {
  INITIAL_BALANCE: "Solde de départ",
  REWARD: "Récompense",
  BANK_SALE: "Revente à la banque",
  MARKETPLACE_SALE: "Vente sur le marché",
  MARKETPLACE_PURCHASE: "Achat sur le marché",
  BOOSTER_PURCHASE: "Achat de booster",
  ADMIN_ADJUSTMENT: "Ajustement administrateur",
};

const editionSelect = { name: true, athlete: { select: { name: true } } } as const;

export async function getWalletHistory(actorId: string, input: unknown, client: PrismaClient = db) {
  const { page, pageSize, type } = walletHistoryQuerySchema.parse(input);
  const where = { walletId: actorId, ...(type ? { type } : {}) };
  const [wallet, rows, total] = await client.$transaction([
    client.wallet.findUnique({
      where: { userId: actorId },
      select: { balance: true, lifetimeEarnings: true, lifetimeSpending: true },
    }),
    client.walletTransaction.findMany({
      where,
      select: { id: true, type: true, amount: true, balanceAfter: true, referenceId: true, createdAt: true },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    client.walletTransaction.count({ where }),
  ], { isolationLevel: "RepeatableRead" });
  if (!wallet) throw new ApiError("WALLET_NOT_FOUND", "Votre portefeuille est introuvable.", 404);

  const references = (...types: WalletTransactionType[]) => [...new Set(
    rows.flatMap(({ type, referenceId }) => types.includes(type) && referenceId !== null ? [referenceId] : []),
  )];
  const cardIds = references("BANK_SALE");
  const listingIds = references("MARKETPLACE_PURCHASE", "MARKETPLACE_SALE");
  const boosterIds = references("BOOSTER_PURCHASE");
  const [cards, listings, boosters] = await Promise.all([
    cardIds.length ? client.cardInstance.findMany({
      where: { id: { in: cardIds } },
      select: { id: true, edition: { select: editionSelect } },
    }) : [],
    listingIds.length ? client.marketplaceListing.findMany({
      where: { id: { in: listingIds } },
      select: { id: true, card: { select: { edition: { select: editionSelect } } } },
    }) : [],
    boosterIds.length ? client.boosterType.findMany({
      where: { id: { in: boosterIds } },
      select: { id: true, nameFr: true },
    }) : [],
  ]);

  const editionLabel = (edition: { name: string; athlete: { name: string } }) =>
    `${edition.athlete.name} — ${edition.name}`;
  const cardDetails = new Map(cards.map(({ id, edition }) => [id, editionLabel(edition)]));
  const listingDetails = new Map(listings.map(({ id, card }) => [id, editionLabel(card.edition)]));
  const boosterDetails = new Map(boosters.map(({ id, nameFr }) => [id, nameFr]));
  const detailByType: Partial<Record<WalletTransactionType, Map<string, string>>> = {
    BANK_SALE: cardDetails, MARKETPLACE_PURCHASE: listingDetails,
    MARKETPLACE_SALE: listingDetails, BOOSTER_PURCHASE: boosterDetails,
  };

  return {
    balance: String(wallet.balance),
    lifetimeEarnings: String(wallet.lifetimeEarnings),
    lifetimeSpending: String(wallet.lifetimeSpending),
    transactions: rows.map(({ id, type, referenceId, amount, balanceAfter, createdAt }) => ({
      id, type, label: walletTransactionLabels[type],
      detail: referenceId === null ? null : detailByType[type]?.get(referenceId) ?? null,
      amount: String(amount),
      balanceAfter: String(balanceAfter),
      createdAt: createdAt.toISOString(),
    })),
    total, page, pageSize,
  };
}

export type WalletHistoryEntry = Awaited<ReturnType<typeof getWalletHistory>>["transactions"][number];
