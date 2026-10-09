import "server-only";
import { Prisma, type DataProvider } from "@/generated/prisma/client";
import { ApiError } from "@/lib/api/errors";
import type { ExternalAthlete } from "@/providers/types";
import { athletePatchSchema, externalAthleteSchema } from "./validation";

const providers: Record<string, DataProvider> = { thesportsdb: "THESPORTSDB", wikidata: "WIKIDATA", olympedia: "OLYMPEDIA" };
const normalize = (value: string) => value.trim().replace(/\s+/g, " ").toLowerCase();
async function requireAdmin(tx: Prisma.TransactionClient, actorId: string) {
  const actor = await tx.user.findUnique({ where: { id: actorId }, select: { role: true } });
  if (actor?.role !== "ADMIN") throw new ApiError("FORBIDDEN", "Cette opération est réservée aux administrateurs.", 403);
}
async function lockAthlete(tx: Prisma.TransactionClient, id: string) {
  await tx.$queryRaw`SELECT "id" FROM "Athlete" WHERE "id" = ${id} FOR UPDATE`;
  const athlete = await tx.athlete.findUnique({ where: { id }, include: { image: true } });
  if (!athlete) throw new ApiError("ATHLETE_NOT_FOUND", "Athlète introuvable.", 404);
  return athlete;
}
function overrides(value: Prisma.JsonValue | null): Prisma.JsonObject {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

/** Caller owns the transaction; provider fetch must finish before entering it. */
export async function applyExternalAthlete(tx: Prisma.TransactionClient, external: ExternalAthlete,
  options: { actorId: string; targetAthleteId?: string }) {
  await requireAdmin(tx, options.actorId);
  const data = externalAthleteSchema.parse(external);
  const provider = providers[data.provider]!;
  if (!data.sportName) throw new ApiError("SPORT_MAPPING_REQUIRED", "Le sport du fournisseur doit être associé à un sport existant.", 409);
  const sports = await tx.sport.findMany({ select: { id: true, providerName: true } });
  const mapped = sports.filter((sport) => normalize(sport.providerName) === normalize(data.sportName!));
  if (mapped.length !== 1) throw new ApiError("SPORT_MAPPING_REQUIRED", "Le sport du fournisseur doit être associé sans ambiguïté à un sport existant.", 409);
  const sportId = mapped[0]!.id;
  // Consistent lock ordering serializes repeated provider IDs and cross-provider names.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`external:${provider}:${data.externalId}`}, 0))`;
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`identity:${sportId}:${normalize(data.fullName)}`}, 0))`;
  const existingId = await tx.athleteExternalId.findUnique({ where: { provider_externalId: { provider, externalId: data.externalId } } });
  if (existingId && options.targetAthleteId && existingId.athleteId !== options.targetAthleteId) {
    throw new ApiError("IDENTITY_CONFLICT", "Cet identifiant est déjà lié à un autre athlète.", 409);
  }
  let athleteId = existingId?.athleteId ?? options.targetAthleteId;
  const action: "created" | "updated" | "linked" = existingId ? "updated" : athleteId ? "linked" : "created";
  if (!athleteId) {
    const candidates = await tx.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "Athlete" WHERE "sportId" = ${sportId}
      AND lower(regexp_replace(trim("name"), '\\s+', ' ', 'g')) = ${normalize(data.fullName)} LIMIT 2`;
    if (candidates.length) throw new ApiError("IDENTITY_REVIEW_REQUIRED", "Un athlète homonyme existe. Vérifiez son identité avant de le lier manuellement.", 409);
    const created = await tx.athlete.create({ data: { name: data.fullName, sportId,
      birthDate: data.birthDate ? new Date(`${data.birthDate}T00:00:00Z`) : null,
      nationality: data.nationality, currentTeam: data.teamName, position: data.position, biography: data.biographyFrench } });
    athleteId = created.id;
  } else {
    const athlete = await lockAthlete(tx, athleteId);
    if (athlete.sportId !== sportId) throw new ApiError("IDENTITY_CONFLICT", "Le sport de l’athlète ne correspond pas à la source.", 409);
    const sameProvider = await tx.athleteExternalId.findUnique({ where: { athleteId_provider: { athleteId, provider } } });
    if (sameProvider && sameProvider.externalId !== data.externalId) throw new ApiError("IDENTITY_CONFLICT", "Cet athlète possède déjà un identifiant pour ce fournisseur.", 409);
    const protectedFields = overrides(athlete.administratorOverrides);
    const update: Prisma.AthleteUpdateInput = {};
    const fields = { name: data.fullName, nationality: data.nationality, currentTeam: data.teamName,
      position: data.position, biography: data.biographyFrench };
    for (const [field, value] of Object.entries(fields)) {
      if (value !== null && !Object.hasOwn(protectedFields, field)) Object.assign(update, { [field]: value });
    }
    if (data.birthDate && !Object.hasOwn(protectedFields, "birthDate")) update.birthDate = new Date(`${data.birthDate}T00:00:00Z`);
    await tx.athlete.update({ where: { id: athleteId }, data: update });
  }
  await tx.athleteExternalId.upsert({ where: { provider_externalId: { provider, externalId: data.externalId } },
    create: { athleteId, provider, externalId: data.externalId }, update: { importedAt: new Date() } });
  const image = data.images[0];
  if (image) await tx.athleteImage.upsert({ where: { athleteId }, update: {}, create: {
    athleteId, url: image.originalUrl, originalUrl: image.originalUrl, source: image.source,
    license: image.license, attribution: image.attribution, usageRestrictions: image.usageRestrictions, approvedForDisplay: false } });
  await tx.adminAuditLog.create({ data: { actorId: options.actorId, action: `ATHLETE_IMPORT_${action.toUpperCase()}`,
    entityType: "Athlete", entityId: athleteId, after: { provider, externalId: data.externalId, sportId,
      manualLink: Boolean(options.targetAthleteId) } } });
  return { athleteId, action };
}

export async function updateAthlete(tx: Prisma.TransactionClient, id: string, patch: unknown, actorId: string) {
  await requireAdmin(tx, actorId);
  const parsed = athletePatchSchema.parse(patch);
  const before = await lockAthlete(tx, id);
  const protectedFields = overrides(before.administratorOverrides);
  for (const field of Object.keys(parsed)) protectedFields[field] = true;
  const { birthDate, ...scalars } = parsed;
  const updated = await tx.athlete.update({ where: { id }, data: { ...scalars,
    ...(birthDate !== undefined ? { birthDate: birthDate === null ? null : new Date(`${birthDate}T00:00:00Z`) } : {}),
    administratorOverrides: protectedFields as Prisma.InputJsonObject } });
  const previous = Object.fromEntries(Object.keys(parsed).map((field) => [field,
    field === "birthDate" ? before.birthDate?.toISOString().slice(0, 10) ?? null : before[field as keyof typeof before]]));
  await tx.adminAuditLog.create({ data: { actorId, action: "ATHLETE_UPDATE", entityType: "Athlete", entityId: id,
    before: previous as Prisma.InputJsonObject, after: parsed as Prisma.InputJsonObject } });
  return updated;
}
