import "server-only";
import type { AdapterUser } from "next-auth/adapters";
import type { Prisma } from "@/generated/prisma/client";
/** Appel exclusivement dans la transaction de création du compte Auth.js. */
export async function createPlayer(tx: Prisma.TransactionClient, data: AdapterUser, options: {passwordHash?: string} = {}) {
  const config = await tx.gameConfiguration.findUniqueOrThrow({where: {id: "default"}});
  const now = new Date();
  const created = await tx.user.create({data: {
    name: data.name, email: data.email, emailVerified: data.emailVerified, image: data.image, role: "PLAYER",
    ...(options.passwordHash ? {passwordHash: options.passwordHash} : {}),
    wallet: {create: {
      balance: config.startingBalance, lifetimeEarnings: config.startingBalance,
      transactions: {create: {type: "INITIAL_BALANCE", amount: config.startingBalance,
        balanceAfter: config.startingBalance, idempotencyKey: "initial-balance"}},
    }},
    passiveBoosters: {create: {stock: 0,
      nextGenerationAt: new Date(now.getTime() + config.passiveIntervalSeconds * 1000)}},
  }, select: {id: true, name: true, email: true, emailVerified: true, image: true, role: true}});
  return {...created, email: data.email};
}
