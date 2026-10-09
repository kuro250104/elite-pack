import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };
function getClient(): PrismaClient {
  if (globalForPrisma.prisma) return globalForPrisma.prisma;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL doit être configurée.");
  const client = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  globalForPrisma.prisma = client;
  return client;
}
// Construction différée : les pages publiques peuvent être compilées sans secret.
export const db = new Proxy({} as PrismaClient, { get(_target, property) {
  const client = getClient();
  const value = Reflect.get(client, property);
  return typeof value === "function" ? value.bind(client) : value;
} });
