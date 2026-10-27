import "server-only";
import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

const parameters = { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 } as const;
const prefix = "scrypt$32768$8$3";
// Comparateur de travail uniquement : cet encodage ne représente aucun compte.
const dummySalt = Buffer.alloc(16);
const dummyDigest = Buffer.alloc(64);

function derive(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, 64, parameters, (error, digest) => error ? reject(error) : resolve(digest));
  });
}
function parse(encoded: string | null): { salt: Buffer; digest: Buffer } | null {
  if (!encoded) return null;
  const parts = encoded.split("$");
  if (parts.length !== 6 || parts.slice(0, 4).join("$") !== prefix ||
    !/^[A-Za-z0-9_-]{22}$/u.test(parts[4]!) || !/^[A-Za-z0-9_-]{86}$/u.test(parts[5]!)) return null;
  const salt = Buffer.from(parts[4]!, "base64url");
  const digest = Buffer.from(parts[5]!, "base64url");
  if (salt.length !== 16 || digest.length !== 64 || salt.toString("base64url") !== parts[4] ||
    digest.toString("base64url") !== parts[5]) return null;
  return { salt, digest };
}

export async function hashPassword(password: string): Promise<string> {
  if (password.length < 12 || password.length > 128) throw new Error("Mot de passe invalide.");
  const salt = randomBytes(16);
  const digest = await derive(password, salt);
  return `${prefix}$${salt.toString("base64url")}$${digest.toString("base64url")}`;
}

/** Unknown users, OAuth-only users and malformed envelopes all perform the fixed-cost derivation. */
export async function verifyPassword(password: string, encoded: string | null): Promise<boolean> {
  if (password.length < 1 || password.length > 128) return false;
  const stored = parse(encoded);
  const digest = await derive(password, stored?.salt ?? dummySalt);
  const matches = timingSafeEqual(digest, stored?.digest ?? dummyDigest);
  return stored !== null && matches;
}
