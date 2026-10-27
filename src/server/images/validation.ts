import { isIP } from "node:net";
import { z } from "zod";

export const compatibleImageLicenses = {
  "CC0-1.0": "https://creativecommons.org/publicdomain/zero/1.0/",
  "CC-BY-4.0": "https://creativecommons.org/licenses/by/4.0/",
  "CC-BY-SA-4.0": "https://creativecommons.org/licenses/by-sa/4.0/",
} as const;

/** References only: no DNS resolution, download or proxy is performed. */
export function isPublicHttpsUrl(value: string): boolean {
  if (value.length > 2048 || /[\\\s\u0000-\u001f\u007f]/u.test(value)) return false;
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    return url.protocol === "https:" && !url.username && !url.password && !url.port &&
      !host.includes(":") && isIP(host) === 0 && host.includes(".") &&
      !host.endsWith(".") && !/(^|\.)(localhost|local|internal|lan|home|onion|test|invalid|example)$/u.test(host);
  } catch {
    return false;
  }
}

export function isAllowedImageUrl(value: string): boolean {
  if (!isPublicHttpsUrl(value)) return false;
  const url = new URL(value);
  if (url.search || url.hash) return false;
  return (url.hostname === "upload.wikimedia.org" && url.pathname.startsWith("/wikipedia/commons/")) ||
    (url.hostname === "www.thesportsdb.com" && url.pathname.startsWith("/images/media/"));
}

export const publicHttpsUrlSchema = z.string().trim().max(2048).refine(isPublicHttpsUrl,
  "Indiquez une URL HTTPS publique, sans identifiants ni port personnalisé.");
export const allowedImageUrlSchema = publicHttpsUrlSchema.refine(isAllowedImageUrl,
  "L’image doit provenir d’un domaine et d’un chemin autorisés.");
const nullableText = (max: number) => z.string().trim().min(1).max(max).nullable();
export const imageMetadataSchema = z.object({
  url: allowedImageUrlSchema,
  originalUrl: publicHttpsUrlSchema,
  source: z.string().trim().min(1).max(250),
  license: nullableText(120),
  licenseUrl: publicHttpsUrlSchema.nullable(),
  attribution: nullableText(2000),
  usageRestrictions: nullableText(4000),
  evidenceUrl: publicHttpsUrlSchema.nullable(),
}).strict();

const expectedVersion = z.number().int().min(0).max(2147483646);
const reason = z.string().trim().min(1).max(4000);
export const imageReviewCommandSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("set-metadata"), expectedVersion, metadata: imageMetadataSchema }).strict(),
  z.object({ action: z.literal("approve"), expectedVersion, rightsConfirmed: z.literal(true), reason }).strict(),
  z.object({ action: z.literal("reject"), expectedVersion, reason }).strict(),
]);
export type ImageReviewCommand = z.infer<typeof imageReviewCommandSchema>;

export function hasCompatibleImageLicense(license: string | null, licenseUrl: string | null): boolean {
  return license !== null && Object.hasOwn(compatibleImageLicenses, license) &&
    compatibleImageLicenses[license as keyof typeof compatibleImageLicenses] === licenseUrl;
}
