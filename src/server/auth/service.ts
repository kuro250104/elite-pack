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

const registrationFields = new Set(["name", "email", "password", "passwordConfirmation"]);
function registrationFieldErrors(issues: { path: PropertyKey[]; message: string }[]) {
  const fields: Record<string, string> = {};
  for (const issue of issues) {
    const field = String(issue.path[0] ?? "");
    if (registrationFields.has(field) && !fields[field]) fields[field] = issue.message;
  }
  return fields;
}

export async function registerPlayer(input: unknown, client: PrismaClient = db): Promise<CredentialUser> {
  const parsed = registrationSchema.safeParse(input);
  if (!parsed.success) {
    throw new ApiError("INVALID_REGISTRATION", "Vérifiez les champs indiqués.", 400, undefined,
      registrationFieldErrors(parsed.error.issues));
  }
  const { name, email, password } = parsed.data;
  await reserveQuota(client, "register", email);
  // Duplicate emails are reported explicitly: the game favours a clear signup over hiding registered addresses.
  if (await client.user.findUnique({ where: { email }, select: { id: true } })) throw emailTaken();
  // Expensive work happens after quota reservation and outside the creation transaction.
  const passwordHash = await hashPassword(password);
  try {
    const user = await client.$transaction((tx) => createPlayer(tx,
      { id: "", name, email, emailVerified: null, image: null }, { passwordHash }));
    return { id: user.id, name: user.name, email, image: user.image, role: user.role };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw emailTaken();
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      throw new ApiError("GAME_NOT_CONFIGURED", "Le jeu n’est pas encore configuré. Réessayez plus tard.", 503);
    }
    throw error;
  }
}
function emailTaken() {
  return new ApiError("EMAIL_TAKEN", "Un compte existe déjà avec cette adresse e-mail.", 409, undefined,
    { email: "Un compte existe déjà avec cette adresse e-mail." });
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
