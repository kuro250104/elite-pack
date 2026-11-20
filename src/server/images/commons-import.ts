import "server-only";
import { z } from "zod";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { db } from "@/lib/db/prisma";
import { ApiError } from "@/lib/api/errors";
import type { CommonsFile, WikidataPerson } from "@/providers/wikimedia/client";
import { WikimediaClient } from "@/providers/wikimedia/client";
import { assertAdminActor } from "@/server/sports/service";
import { reviewAthleteImage } from "./service";
import { commonsLicense, compatibleImageLicenses, isAllowedImageUrl } from "./validation";

export const commonsImportOptionsSchema = z.object({
  limit: z.number().int().min(1).max(2_000).default(500),
  sportId: z.string().min(1).max(200).optional(),
  // Without approval, Commons metadata is stored for manual review in /admin/images.
  autoApprove: z.boolean().default(true),
}).strict();
export type CommonsImportOptions = z.input<typeof commonsImportOptionsSchema>;

export interface CommonsSource {
  searchPeople(name: string): Promise<string[]>;
  getPeople(qids: string[]): Promise<WikidataPerson[]>;
  getCommonsFiles(fileNames: string[]): Promise<CommonsFile[]>;
}
export type CommonsImportEvent = { type: "athlete"; name: string; status: CommonsImportStatus; done: number; total: number; error?: string };
type CommonsImportStatus = "approved" | "pending-review" | "no-match" | "ambiguous" | "no-image" | "incompatible" | "conflict" | "failed";

const thumbnailWidth = 500;
/**
 * Commons adds "personality" to most photos of identifiable people: a reminder that personality rights exist, which
 * applies equally to untagged portraits of real athletes, not a licence restriction. It is kept in usageRestrictions.
 * Any other declared restriction (trademark, insignia…) leaves the image to a manual review.
 */
const acceptedRestrictions = new Set(["personality"]);
const blockingRestrictions = (value: string | null) => (value ?? "").split("|").map((item) => item.trim().toLowerCase())
  .filter((item) => item && !acceptedRestrictions.has(item));
const reviewableMimes = new Set(["image/jpeg", "image/png", "image/webp"]);
const fileKey = (name: string) => name.replace(/^File:/, "").replace(/_/g, " ").trim().replace(/^./, (letter) => letter.toUpperCase());

/** Commons "Artist" is HTML (links, spans): keep its text only. */
export function plainAttribution(html: string | null): string | null {
  if (!html) return null;
  const text = html.replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, "\"")
    .replace(/&#0?39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\s+/g, " ").trim();
  return text && text.length <= 300 ? text : null;
}

/**
 * 500 px thumbnail on upload.wikimedia.org (standard width, no query string), or the original when it is smaller.
 * thumb.wikimedia.org URLs returned by the API carry tracking parameters and are not on the allowed host list.
 */
export function commonsDisplayUrl(file: Pick<CommonsFile, "fileUrl" | "width">): string | null {
  let url: URL;
  try { url = new URL(file.fileUrl); } catch { return null; }
  const match = /^\/wikipedia\/commons\/([0-9a-f])\/([0-9a-f]{2})\/([^/]+)$/.exec(url.pathname);
  if (url.hostname !== "upload.wikimedia.org" || !match) return null;
  const display = file.width !== null && file.width > thumbnailWidth
    ? `https://upload.wikimedia.org/wikipedia/commons/thumb/${match[1]}/${match[2]}/${match[3]}/${thumbnailWidth}px-${match[3]}`
    : `https://upload.wikimedia.org${url.pathname}`;
  return isAllowedImageUrl(display) ? display : null;
}

/**
 * Finds a Wikimedia Commons portrait for each athlete without an approved or reviewed image.
 * Identity: the Wikidata item must be a human whose label or alias matches the name AND whose birth date (day precision)
 * equals the one imported from TheSportsDB; zero or several candidates leave the athlete untouched.
 * Approval goes through reviewAthleteImage, with the same checks and audit as a manual review, and only when the
 * licence is compatible, an author is credited and Commons declares no restriction other than the personality notice.
 * Network calls run outside transactions; each athlete is committed on its own.
 */
export async function runCommonsImageImport(actorId: string, input: CommonsImportOptions = {},
  dependencies: { client?: PrismaClient; source?: CommonsSource; onEvent?: (event: CommonsImportEvent) => void } = {}) {
  const client = dependencies.client ?? db;
  const options = commonsImportOptionsSchema.parse(input);
  const source = dependencies.source ?? new WikimediaClient();
  const emit = dependencies.onEvent ?? (() => undefined);
  await client.$transaction((tx) => assertAdminActor(tx, actorId));

  // Approved images and administrator decisions (reviewedById) are never replaced.
  const athletes = await client.athlete.findMany({
    where: { active: true, birthDate: { not: null }, ...(options.sportId ? { sportId: options.sportId } : {}), OR: [{ image: null }, { image: { approvedForDisplay: false, reviewedById: null } }] },
    select: { id: true, name: true, birthDate: true, image: { select: { id: true, version: true, source: true } },
      externalIds: { where: { provider: "WIKIDATA" }, select: { externalId: true } } },
    orderBy: [{ prestigeScore: "desc" }, { name: "asc" }], take: options.limit,
  });
  const counts: Record<CommonsImportStatus, number> = { approved: 0, "pending-review": 0, "no-match": 0, ambiguous: 0,
    "no-image": 0, incompatible: 0, conflict: 0, failed: 0 };
  let done = 0;
  const record = (name: string, status: CommonsImportStatus, error?: string) => {
    counts[status]++;
    emit({ type: "athlete", name, status, done: ++done, total: athletes.length, ...(error ? { error } : {}) });
  };

  for (const athlete of athletes) {
    try {
      const birthDate = athlete.birthDate!.toISOString().slice(0, 10);
      // An earlier run may already have confirmed the Wikidata identity.
      const known = athlete.externalIds[0]?.externalId;
      const candidates = known ? [known] : await source.searchPeople(athlete.name);
      const people = candidates.length ? await source.getPeople(candidates) : [];
      const matches = people.filter((person) => person.human && person.birthDates.includes(birthDate));
      if (matches.length === 0) { record(athlete.name, "no-match"); continue; }
      if (matches.length > 1) { record(athlete.name, "ambiguous"); continue; }
      const person = matches[0]!;
      if (!person.imageFile) {
        const linked = await linkWikidata(client, athlete.id, person.qid);
        record(athlete.name, linked ? "no-image" : "conflict");
        continue;
      }
      const file = (await source.getCommonsFiles([person.imageFile])).find((row) => fileKey(row.title) === fileKey(person.imageFile!));
      const license = file ? commonsLicense(file.licenseShortName, file.licenseUrl) : null;
      const url = file && file.mime && reviewableMimes.has(file.mime) ? commonsDisplayUrl(file) : null;
      const attribution = file ? plainAttribution(file.artistHtml) : null;
      if (!file || !url) { record(athlete.name, "incompatible"); continue; }
      const metadata = { url, originalUrl: file.descriptionUrl, source: "Wikimedia Commons",
        license: license ?? (file.licenseShortName?.slice(0, 120) || null),
        licenseUrl: license ? compatibleImageLicenses[license] : null,
        attribution, usageRestrictions: file.restrictions ? `Restrictions déclarées sur Commons : ${file.restrictions}`.slice(0, 4000) : null,
        evidenceUrl: file.descriptionUrl };
      const approvable = options.autoApprove && license !== null && attribution !== null && blockingRestrictions(file.restrictions).length === 0;
      const status = await client.$transaction(async (tx) => {
        if (!await linkWikidata(tx, athlete.id, person.qid)) return "conflict" as const;
        await tx.$queryRaw`SELECT id FROM "Athlete" WHERE id = ${athlete.id} FOR UPDATE`;
        const current = await tx.athleteImage.findUnique({ where: { athleteId: athlete.id } });
        // Re-checked under lock: an administrator may have reviewed the image since the selection.
        if (current && (current.approvedForDisplay || current.reviewedById)) return "conflict" as const;
        const image = current
          ? await reviewAthleteImage(tx, current.id, { action: "set-metadata", expectedVersion: current.version, metadata }, actorId)
          : await tx.athleteImage.create({ data: { athleteId: athlete.id, ...metadata, approvedForDisplay: false } });
        if (!current) await tx.adminAuditLog.create({ data: { actorId, action: "IMAGE_METADATA_UPDATE", entityType: "AthleteImage",
          entityId: image.id, after: { ...metadata, source: metadata.source, wikidata: person.qid } } });
        if (!approvable) return "pending-review" as const;
        await reviewAthleteImage(tx, image.id, { action: "approve", expectedVersion: image.version, rightsConfirmed: true,
          reason: `Approbation automatique : licence ${license} et auteur relevés sur la page Commons du fichier, sans restriction déclarée. ` +
            `Identité Wikidata ${person.qid} confirmée par le nom et la date de naissance (${birthDate}).` }, actorId);
        return "approved" as const;
      });
      record(athlete.name, status);
    } catch (error) {
      if (error instanceof ApiError && error.code === "FORBIDDEN") throw error;
      record(athlete.name, "failed", error instanceof ApiError ? error.code : error instanceof z.ZodError ? "INVALID_DATA" : error instanceof Error ? (error.message.trim().split("\n").at(-1) ?? "").slice(0, 200) : "UNKNOWN");
    }
  }
  const summary = { candidates: athletes.length, ...counts };
  await client.adminAuditLog.create({ data: { actorId, action: "IMAGE_COMMONS_IMPORT", entityType: "AthleteImage", after: { ...summary, options } } });
  return summary;
}

/** Stores the confirmed Wikidata identity; false when it already belongs to another athlete or differs from a stored one. */
async function linkWikidata(client: PrismaClient | Prisma.TransactionClient, athleteId: string, qid: string) {
  const [byQid, byAthlete] = await Promise.all([
    client.athleteExternalId.findUnique({ where: { provider_externalId: { provider: "WIKIDATA", externalId: qid } } }),
    client.athleteExternalId.findUnique({ where: { athleteId_provider: { athleteId, provider: "WIKIDATA" } } }),
  ]);
  if ((byQid && byQid.athleteId !== athleteId) || (byAthlete && byAthlete.externalId !== qid)) return false;
  if (!byQid) await client.athleteExternalId.create({ data: { athleteId, provider: "WIKIDATA", externalId: qid } });
  return true;
}
