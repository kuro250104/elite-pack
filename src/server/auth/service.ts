import "server-only";
import { createHash } from "node:crypto";
import { Prisma, type PrismaClient, type Role } from "@/generated/prisma/client";
import { db } from "@/lib/db/prisma";
import { ApiError } from "@/lib/api/errors";
import { createPlayer } from "@/server/players/create-player";
import { consumeRateLimit } from "@/server/security/rate-limit";
import { hashPassword, verifyPassword } from "./password";
import { loginSchema, registrationSchema } from "./validation";

export interface CredentialUser {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
  role: Role;
}
function emailDigest(email: string) { return createHash("sha256").update(email).digest("hex"); }
async function reserveQuota(client: PrismaClient, action: "register" | "login", email: string) {
  await client.$transaction(async (tx) => {
    // Stable order: global reservation first, then the normalized email digest.
    await consumeRateLimit(tx, `auth:${action}:global`, { limit: action === "register" ? 10 : 60, windowSeconds: 60 });
    await consumeRateLimit(tx, `auth:${action}:email:${emailDigest(email)}`, {
      limit: action === "register" ? 3 : 5, windowSeconds: action === "register" ? 3600 : 60,
    });
  });
}

export async function registerPlayer(input: unknown, client: PrismaClient = db): Promise<CredentialUser> {
  const parsed = registrationSchema.safeParse(input);
  if (!parsed.success) throw new ApiError("INVALID_REGISTRATION", "Vérifiez les informations et la confirmation du mot de passe.", 400);
  const { name, email, password } = parsed.data;
  await reserveQuota(client, "register", email);
  // Expensive work happens after quota reservation and outside the creation transaction.
  const passwordHash = await hashPassword(password);
  try {
    const user = await client.$transaction((tx) => createPlayer(tx,
      { id: "", name, email, emailVerified: null, image: null }, { passwordHash }));
    return { id: user.id, name: user.name, email, image: user.image, role: user.role };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new ApiError("REGISTRATION_UNAVAILABLE", "Impossible de créer le compte avec ces informations.", 409);
    }
    throw error;
  }
}

export async function authenticateCredentials(input: unknown, client: PrismaClient = db): Promise<CredentialUser | null> {
  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) return null;
  const { email, password } = parsed.data;
  await reserveQuota(client, "login", email);
  const user = await client.user.findUnique({ where: { email }, select: {
    id: true, name: true, email: true, image: true, role: true, passwordHash: true,
  } });
  const matches = await verifyPassword(password, user?.passwordHash ?? null);
  if (!user || !user.passwordHash || !user.email || !matches) return null;
  return { id: user.id, name: user.name, email: user.email, image: user.image, role: user.role };
}
