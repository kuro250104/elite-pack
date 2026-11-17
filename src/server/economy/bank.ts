import "server-only";
import { z } from "zod";
import { db } from "@/lib/db/prisma";
import type { PrismaClient } from "@/generated/prisma/client";
import { ApiError } from "@/lib/api/errors";
import { bankResalePrice } from "./valuation";

export const bankSaleSchema = z.object({ cardInstanceId: z.string().min(1).max(100) }).strict();

/**
 * Sells one owned card to the bank: the instance is retired (never re-minted, minted supply unchanged),
 * the wallet is credited and the ledger records BANK_SALE, all in one transaction. Discovery history is kept.
 */
export async function sellToBank(actorId: string, input: unknown, idempotencyKey: string, client: PrismaClient = db) {
  const { cardInstanceId } = bankSaleSchema.parse(input);
  const key = z.uuid().parse(idempotencyKey);
  return client.$transaction(async (tx) => {
    // Serializes the player's wallet operations; the replay check below then sees committed sales only.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`wallet:user:${actorId}`}, 0))`;
    const [wallet] = await tx.$queryRaw<{ balance: bigint }[]>`SELECT balance FROM "Wallet" WHERE "userId" = ${actorId} FOR UPDATE`;
    if (!wallet) throw new ApiError("WALLET_NOT_FOUND", "Votre portefeuille est introuvable.", 409);
    const previous = await tx.walletTransaction.findUnique({ where: { walletId_idempotencyKey: { walletId: actorId, idempotencyKey: `bank-sale:${key}` } } });
    if (previous) {
      if (previous.type !== "BANK_SALE" || previous.referenceId !== cardInstanceId)
        throw new ApiError("IDEMPOTENCY_CONFLICT", "Cette clé a déjà été utilisée pour une autre opération.", 409);
      return { cardInstanceId, amount: String(previous.amount), balance: String(previous.balanceAfter), replay: true };
    }
    const [card] = await tx.$queryRaw<{ ownerId: string | null; retiredAt: Date | null; baseValue: bigint }[]>`
      SELECT ci."ownerId", ci."retiredAt", e."baseValue" FROM "CardInstance" ci JOIN "CardEdition" e ON e.id = ci."editionId"
      WHERE ci.id = ${cardInstanceId} FOR UPDATE OF ci`;
    // Unknown, foreign and retired cards get the same answer so ownership is not disclosed.
    if (!card || card.ownerId !== actorId || card.retiredAt) throw new ApiError("CARD_NOT_OWNED", "Cette carte ne fait pas partie de votre collection.", 404);
    if (await tx.marketplaceListing.count({ where: { cardInstanceId, status: "ACTIVE" } }))
      throw new ApiError("CARD_LISTED", "Retirez d’abord cette carte du marché avant de la revendre à la banque.", 409);
    const { bankResaleBasisPoints } = await tx.gameConfiguration.findUniqueOrThrow({ where: { id: "default" }, select: { bankResaleBasisPoints: true } });
    const amount = bankResalePrice(card.baseValue, bankResaleBasisPoints);
    await tx.cardInstance.update({ where: { id: cardInstanceId }, data: { ownerId: null, retiredAt: new Date() } });
    const balance = wallet.balance + amount;
    await tx.wallet.update({ where: { userId: actorId }, data: { balance, lifetimeEarnings: { increment: amount } } });
    await tx.walletTransaction.create({ data: { walletId: actorId, type: "BANK_SALE", amount, balanceAfter: balance,
      idempotencyKey: `bank-sale:${key}`, referenceId: cardInstanceId, metadata: { baseValue: String(card.baseValue), bankResaleBasisPoints } } });
    return { cardInstanceId, amount: String(amount), balance: String(balance), replay: false };
  });
}
