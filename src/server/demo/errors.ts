import "server-only";
import { z } from "zod";
import { ApiError } from "@/lib/api/errors";
import { db } from "@/lib/db/prisma";

/** The error demonstration (oral, onboarding) exists in development, or in production only when explicitly enabled. */
export function errorDemoEnabled() {
  return process.env.NODE_ENV !== "production" || process.env.ERROR_DEMO_ENABLED === "true";
}

export const errorDemoKinds = ["validation", "non-authentifie", "interdit", "introuvable", "conflit", "sql", "crash"] as const;
export type ErrorDemoKind = (typeof errorDemoKinds)[number];
export const errorDemoQuerySchema = z.object({ type: z.enum(errorDemoKinds) });

/**
 * Throws a real error of each family, so that the whole chain (mapping, response, logs) is exercised:
 * Zod validation, refused access, real Prisma "record not found", business conflict, real SQL error and code crash.
 */
export async function triggerDemoError(kind: ErrorDemoKind): Promise<never> {
  switch (kind) {
    case "validation":
      z.object({ prix: z.number().int().min(1) }).parse({ prix: "zéro" });
      break;
    case "non-authentifie":
      throw new ApiError("UNAUTHENTICATED", "Veuillez vous connecter.", 401);
    case "interdit":
      throw new ApiError("FORBIDDEN", "Cette action est réservée aux administrateurs.", 403);
    case "introuvable":
      // Real ORM error: Prisma P2025, translated into 404.
      await db.sport.update({ where: { id: "demo-sport-inexistant" }, data: { active: false } });
      break;
    case "conflit":
      throw new ApiError("LISTING_ALREADY_SOLD", "Cette carte vient d’être vendue.", 409);
    case "sql":
      // Real SQL error from PostgreSQL (unknown table): 500 without detail in production, full detail in development.
      await db.$queryRawUnsafe("SELECT * FROM table_inexistante_demo");
      break;
    case "crash": {
      const wallet = undefined as unknown as { balance: bigint };
      return Promise.reject(new TypeError(`Démonstration : lecture impossible du solde (${String(wallet?.balance)})`));
    }
  }
  throw new Error("Démonstration : aucune erreur déclenchée.");
}
