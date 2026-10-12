import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { ApiError } from "@/lib/api/errors";
import { hasCompatibleImageLicense, imageMetadataSchema, imageReviewCommandSchema } from "./validation";

/** Caller commits metadata/decision and its audit record together; no remote content is fetched. */
export async function reviewAthleteImage(
  tx: Prisma.TransactionClient,
  imageId: string,
  input: unknown,
  actorId: string,
) {
  const actor = await tx.user.findUnique({ where: { id: actorId }, select: { role: true } });
  if (actor?.role !== "ADMIN") throw new ApiError("FORBIDDEN", "Cette opération est réservée aux administrateurs.", 403);
  const command = imageReviewCommandSchema.parse(input);
  await tx.$queryRaw`SELECT "id" FROM "AthleteImage" WHERE "id" = ${imageId} FOR UPDATE`;
  const before = await tx.athleteImage.findUnique({ where: { id: imageId } });
  if (!before) throw new ApiError("IMAGE_NOT_FOUND", "Image introuvable.", 404);
  if (before.version !== command.expectedVersion) {
    throw new ApiError("IMAGE_VERSION_CONFLICT", "Cette image a été modifiée. Rechargez-la avant de poursuivre.", 409);
  }
  const [clock] = await tx.$queryRaw<Array<{ now: Date }>>`SELECT clock_timestamp() AS now`;
  if (!clock) throw new Error("Horloge PostgreSQL indisponible.");
  let data: Prisma.AthleteImageUncheckedUpdateManyInput;
  if (command.action === "set-metadata") {
    data = { ...command.metadata, approvedForDisplay: false, decisionReason: null,
      reviewedById: null, reviewedAt: null, version: { increment: 1 } };
  } else {
    if (command.action === "approve") {
      const metadata = imageMetadataSchema.safeParse({ url: before.url, originalUrl: before.originalUrl,
        source: before.source, license: before.license, licenseUrl: before.licenseUrl,
        attribution: before.attribution, usageRestrictions: before.usageRestrictions, evidenceUrl: before.evidenceUrl });
      if (!metadata.success || !before.evidenceUrl || !before.attribution ||
        !hasCompatibleImageLicense(before.license, before.licenseUrl)) {
        throw new ApiError("IMAGE_RIGHTS_INCOMPLETE", "La licence compatible, sa preuve et l’attribution sont obligatoires avant l’approbation.", 400);
      }
    }
    data = { approvedForDisplay: command.action === "approve", decisionReason: command.reason,
      reviewedById: actorId, reviewedAt: clock.now, version: { increment: 1 } };
  }
  const result = await tx.athleteImage.updateMany({ where: { id: imageId, version: command.expectedVersion }, data });
  if (result.count !== 1) throw new ApiError("IMAGE_VERSION_CONFLICT", "Cette image a été modifiée. Rechargez-la avant de poursuivre.", 409);
  const updated = await tx.athleteImage.findUniqueOrThrow({ where: { id: imageId } });
  // ISO timestamps keep audit JSON independent of Prisma Date serialization.
  const snapshot = (value: typeof before): Prisma.InputJsonObject => ({ ...value,
    reviewedAt: value.reviewedAt?.toISOString() ?? null });
  await tx.adminAuditLog.create({ data: { actorId, entityType: "AthleteImage", entityId: imageId,
    action: command.action === "set-metadata" ? "IMAGE_METADATA_UPDATE" : command.action === "approve" ? "IMAGE_APPROVE" : "IMAGE_REJECT",
    before: snapshot(before), after: { ...snapshot(updated),
      ...(command.action === "approve" ? { rightsConfirmed: true } : {}) } } });
  return updated;
}
