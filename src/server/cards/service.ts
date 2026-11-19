import "server-only";
import type { AcquisitionSource, Prisma } from "@/generated/prisma/client";
import { ApiError } from "@/lib/api/errors";

/** Caller owns the transaction. Lock order: sports, athletes, editions. */
export async function mintCardInstance(
  tx: Prisma.TransactionClient,
  editionId: string,
  ownerId: string,
  openingId?: string,
  source: AcquisitionSource = "BOOSTER",
) {
  const initial = await tx.cardEdition.findUnique({ where: { id: editionId }, select: {
    athleteId: true, athlete: { select: { sportId: true } },
  } });
  if (!initial) throw new ApiError("EDITION_UNAVAILABLE", "Cette édition n’est pas disponible.", 409);
  await tx.$queryRaw`SELECT "id" FROM "Sport" WHERE "id" = ${initial.athlete.sportId} FOR SHARE`;
  await tx.$queryRaw`SELECT "id" FROM "Athlete" WHERE "id" = ${initial.athleteId} FOR SHARE`;
  await tx.$queryRaw`SELECT "id" FROM "CardEdition" WHERE "id" = ${editionId} FOR UPDATE`;
  const edition = await tx.cardEdition.findUnique({ where: { id: editionId }, select: {
    athleteId: true, active: true, athlete: { select: { active: true, sportId: true, sport: { select: { active: true } } } },
  } });
  if (!edition?.active || !edition.athlete.active || !edition.athlete.sport.active ||
    edition.athleteId !== initial.athleteId || edition.athlete.sportId !== initial.athlete.sportId) {
    throw new ApiError("EDITION_UNAVAILABLE", "Cette édition n’est pas disponible.", 409);
  }
  if (!await tx.user.findUnique({ where: { id: ownerId }, select: { id: true } })) {
    throw new ApiError("PLAYER_NOT_FOUND", "Ce joueur est introuvable.", 404);
  }
  const [supply] = await tx.$queryRaw<Array<{ mintedSupply: number; maxSupply: number | null }>>`
    UPDATE "CardEdition" SET "mintedSupply" = "mintedSupply" + 1, "updatedAt" = clock_timestamp()
    WHERE "id" = ${editionId} AND "active" = TRUE AND "releaseDate" <= clock_timestamp()
      AND ("maxSupply" IS NULL OR "mintedSupply" < "maxSupply")
    RETURNING "mintedSupply", "maxSupply"
  `;
  if (!supply) throw new ApiError("EDITION_UNAVAILABLE", "Cette édition est épuisée ou indisponible.", 409);
  const card = await tx.cardInstance.create({ data: {
    editionId, ownerId, openingId, acquisitionSource: source,
    serialNumber: supply.maxSupply === null ? null : supply.mintedSupply,
  } });
  await tx.cardDiscovery.upsert({ where: { userId_editionId: { userId: ownerId, editionId } },
    create: { userId: ownerId, editionId }, update: {} });
  return card;
}
