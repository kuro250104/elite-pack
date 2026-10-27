import "server-only";
import type { AthleteImage } from "@/generated/prisma/client";
import { hasCompatibleImageLicense, imageMetadataSchema } from "./validation";
/** Fail closed even for older/manual records. No remote fetch or image proxy. */
export function displayableAthleteImage(image: AthleteImage | null) {
  if (!image?.approvedForDisplay || !image.reviewedAt || !image.reviewedById || !image.decisionReason?.trim()) return null;
  const metadata = imageMetadataSchema.safeParse({url: image.url, originalUrl: image.originalUrl, source: image.source,
    license: image.license, licenseUrl: image.licenseUrl, attribution: image.attribution,
    usageRestrictions: image.usageRestrictions, evidenceUrl: image.evidenceUrl});
  if (!metadata.success || !image.attribution?.trim() || !image.evidenceUrl || !hasCompatibleImageLicense(image.license, image.licenseUrl)) return null;
  return {url: image.url, originalUrl: image.originalUrl, attribution: image.attribution, license: image.license!, licenseUrl: image.licenseUrl!};
}
