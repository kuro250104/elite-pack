import "server-only";
import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import type { ExternalSport } from "@/providers/types";
import { ApiError } from "@/lib/api/errors";
import { sportPatchSchema, type SportPatch } from "./validation";

// Lexique de traduction uniquement : le catalogue reste fourni par la base.
const translations: Record<string, string> = {
  soccer: "Football", basketball: "Basketball", tennis: "Tennis", motorsport: "Sports automobiles",
  "formula 1": "Formule 1", rugby: "Rugby", "rugby union": "Rugby à XV", "rugby league": "Rugby à XIII",
  cycling: "Cyclisme", athletics: "Athlétisme", swimming: "Natation", boxing: "Boxe", fighting: "Sports de combat",
  mma: "MMA", golf: "Golf", volleyball: "Volleyball", baseball: "Baseball", "ice hockey": "Hockey sur glace",
  "american football": "Football américain", cricket: "Cricket", badminton: "Badminton",
  "table tennis": "Tennis de table", handball: "Handball", skiing: "Ski", skating: "Patinage",
};
const externalSportSchema = z.object({externalId: z.string().regex(/^\d{1,20}$/), providerName: z.string().trim().min(1).max(100), category: z.string().max(100).nullable()});
export function normalizeSportName(name: string) {return name.trim().replace(/\s+/g, " ").toLocaleLowerCase("en-US");}
export function frenchSportName(sport: ExternalSport) {return translations[normalizeSportName(sport.providerName)] ?? `Sport à traduire (${sport.externalId})`;}
export async function assertAdminActor(tx: Prisma.TransactionClient, actorId: string) {
  const user = await tx.user.findUnique({where: {id: actorId}, select: {role: true}});
  if (user?.role !== "ADMIN") throw new ApiError("FORBIDDEN", "Cette action est réservée aux administrateurs.", 403);
}
export async function importSports(tx: Prisma.TransactionClient, externalSports: ExternalSport[], actorId: string) {
  await assertAdminActor(tx, actorId);
  const sports = z.array(externalSportSchema).max(500).parse(externalSports);
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended('sports:catalogue', 0))`;
  let created = 0;
  for (const sport of sports) {
    const existing = await tx.sport.findUnique({where: {providerId: sport.externalId}});
    if (existing) {
      // Traduction, activation et icône appartiennent à l’administrateur.
      await tx.sport.update({where: {id: existing.id}, data: {providerName: sport.providerName, category: sport.category}});
    } else {
      await tx.sport.create({data: {providerId: sport.externalId, providerName: sport.providerName,
        slug: `thesportsdb-${sport.externalId}`, nameFr: frenchSportName(sport), category: sport.category, active: false}});
      created++;
    }
  }
  await tx.adminAuditLog.create({data: {actorId, action: "IMPORT_SPORTS", entityType: "Sport", after: {processed: sports.length, created}}});
  return {processed: sports.length, created};
}
export async function updateSport(tx: Prisma.TransactionClient, id: string, patch: SportPatch, actorId: string) {
  await assertAdminActor(tx, actorId);
  const parsed = sportPatchSchema.parse(patch);
  await tx.$queryRaw`SELECT id FROM "Sport" WHERE id = ${id} FOR UPDATE`;
  const before = await tx.sport.findUnique({where: {id}});
  if (!before) throw new ApiError("NOT_FOUND", "Ce sport est introuvable.", 404);
  const nameFr = parsed.nameFr ?? before.nameFr;
  if ((parsed.active ?? before.active) && nameFr.startsWith("Sport à traduire (")) {
    throw new ApiError("TRANSLATION_REQUIRED", "Renseignez le nom français avant d’activer ce sport.", 400);
  }
  const updated = await tx.sport.update({where: {id}, data: parsed});
  await tx.adminAuditLog.create({data: {actorId, action: "UPDATE_SPORT", entityType: "Sport", entityId: id,
    before: {nameFr: before.nameFr, active: before.active}, after: {nameFr: updated.nameFr, active: updated.active}}});
  return updated;
}
