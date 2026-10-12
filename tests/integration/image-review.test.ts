import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, type Prisma } from "@/generated/prisma/client";
import { reviewAthleteImage } from "@/server/images/service";
import { applyExternalAthlete } from "@/server/athletes/service";
import { afterAll, describe, expect, it } from "vitest";

const connectionString = process.env.TEST_DATABASE_URL;
if (!connectionString) throw new Error("TEST_DATABASE_URL est obligatoire pour la revue des images.");
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
afterAll(async () => prisma.$disconnect());
const metadata = {
  url: "https://upload.wikimedia.org/wikipedia/commons/a/a0/Test.jpg",
  originalUrl: "https://commons.wikimedia.org/wiki/File:Test.jpg",
  source: "Wikimedia Commons",
  license: "CC-BY-4.0",
  licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
  attribution: "Auteur de test — CC BY 4.0",
  usageRestrictions: "Conserver l’attribution et indiquer les modifications.",
  evidenceUrl: "https://commons.wikimedia.org/wiki/File:Test.jpg#Licensing",
};
const approve = (version: number) => ({ action: "approve", expectedVersion: version, rightsConfirmed: true,
  reason: "Licence, attribution et utilisation prévue examinées." });

async function fixture(tx: Prisma.TransactionClient) {
  const admin = await tx.user.create({ data: { role: "ADMIN" } });
  const player = await tx.user.create({ data: {} });
  const sport = await tx.sport.create({ data: { slug: randomUUID(), providerName: `Sport ${randomUUID()}`, nameFr: "Sport de test" } });
  const athlete = await tx.athlete.create({ data: { name: `Athlète ${randomUUID()}`, sportId: sport.id } });
  const image = await tx.athleteImage.create({ data: { athleteId: athlete.id, ...metadata } });
  return { admin, player, sport, athlete, image };
}
async function isolated(test: (tx: Prisma.TransactionClient) => Promise<void>) {
  const rollback = new Error("Annulation volontaire de la revue d’image");
  await expect(prisma.$transaction(async (tx) => { await test(tx); throw rollback; })).rejects.toBe(rollback);
}

describe("Revue administrative des images", () => {
  it("refuse les joueurs, les images absentes et les versions obsolètes", async () => isolated(async (tx) => {
    const { admin, player, image } = await fixture(tx);
    await expect(reviewAthleteImage(tx, image.id, approve(0), player.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(reviewAthleteImage(tx, randomUUID(), approve(0), admin.id)).rejects.toMatchObject({ code: "IMAGE_NOT_FOUND" });
    await expect(reviewAthleteImage(tx, image.id, approve(1), admin.id)).rejects.toMatchObject({ code: "IMAGE_VERSION_CONFLICT" });
    expect(await tx.adminAuditLog.count({ where: { actorId: admin.id } })).toBe(0);
  }));

  it("approuve avec audit, puis révoque avec motif sans perdre la preuve", async () => isolated(async (tx) => {
    const { admin, image } = await fixture(tx);
    const approved = await reviewAthleteImage(tx, image.id, approve(0), admin.id);
    expect(approved).toMatchObject({ approvedForDisplay: true, version: 1, reviewedById: admin.id, evidenceUrl: metadata.evidenceUrl });
    expect(approved.reviewedAt).toBeInstanceOf(Date);
    const audit = await tx.adminAuditLog.findFirstOrThrow({ where: { entityId: image.id, action: "IMAGE_APPROVE" } });
    expect(audit.after).toMatchObject({ rightsConfirmed: true, approvedForDisplay: true, version: 1 });
    const rejected = await reviewAthleteImage(tx, image.id, { action: "reject", expectedVersion: 1, reason: "Preuve révoquée par la source." }, admin.id);
    expect(rejected).toMatchObject({ approvedForDisplay: false, version: 2, decisionReason: "Preuve révoquée par la source.", evidenceUrl: metadata.evidenceUrl });
    expect(await tx.adminAuditLog.count({ where: { entityId: image.id } })).toBe(2);
  }));

  it("retire toute approbation dès modification des métadonnées", async () => isolated(async (tx) => {
    const { admin, image } = await fixture(tx);
    await reviewAthleteImage(tx, image.id, approve(0), admin.id);
    const updated = await reviewAthleteImage(tx, image.id, { action: "set-metadata", expectedVersion: 1,
      metadata: { ...metadata, attribution: "Attribution modifiée" } }, admin.id);
    expect(updated).toMatchObject({ approvedForDisplay: false, reviewedAt: null, reviewedById: null, decisionReason: null, version: 2 });
    expect(await tx.adminAuditLog.count({ where: { entityId: image.id, action: "IMAGE_METADATA_UPDATE" } })).toBe(1);
  }));

  it("refuse une preuve absente ou une licence non compatible", async () => isolated(async (tx) => {
    const { admin, image } = await fixture(tx);
    await tx.athleteImage.update({ where: { id: image.id }, data: { evidenceUrl: null } });
    await expect(reviewAthleteImage(tx, image.id, approve(0), admin.id)).rejects.toMatchObject({ code: "IMAGE_RIGHTS_INCOMPLETE" });
    await tx.athleteImage.update({ where: { id: image.id }, data: { evidenceUrl: metadata.evidenceUrl, license: "Tous droits réservés" } });
    await expect(reviewAthleteImage(tx, image.id, approve(0), admin.id)).rejects.toMatchObject({ code: "IMAGE_RIGHTS_INCOMPLETE" });
    expect((await tx.athleteImage.findUniqueOrThrow({ where: { id: image.id } })).approvedForDisplay).toBe(false);
  }));

  it("préserve une image revue lors du réimport d’un athlète", async () => isolated(async (tx) => {
    const { admin, image, athlete, sport } = await fixture(tx);
    await reviewAthleteImage(tx, image.id, approve(0), admin.id);
    await applyExternalAthlete(tx, { provider: "thesportsdb", externalId: randomUUID(), fullName: athlete.name,
      sportName: sport.providerName, nationality: null, birthDate: null, teamName: null, position: null,
      biographyFrench: null, images: [{ source: "thesportsdb", originalUrl: "https://www.thesportsdb.com/images/media/player/other.jpg",
        license: null, attribution: null, usageRestrictions: null, approvedForDisplay: false }] },
    { actorId: admin.id, targetAthleteId: athlete.id });
    expect(await tx.athleteImage.findUniqueOrThrow({ where: { id: image.id } })).toMatchObject({
      url: metadata.url, license: metadata.license, evidenceUrl: metadata.evidenceUrl, reviewedById: admin.id, approvedForDisplay: true, version: 1 });
  }));

  it("rejette en base une approbation sans décision documentée", async () => {
    const rollback = new Error("Annulation volontaire de contrainte");
    await expect(prisma.$transaction(async (tx) => {
      const { image } = await fixture(tx);
      await expect(tx.athleteImage.update({ where: { id: image.id }, data: { approvedForDisplay: true } })).rejects.toMatchObject({ code: "P2039", meta: { driverAdapterError: { cause: { originalCode: "23514" } } } });
      throw rollback;
    })).rejects.toBe(rollback);
  });

  it("annule l’approbation si l’écriture de l’audit échoue", async () => {
    const fixtures = await prisma.$transaction(fixture);
    const auditFailure = new Error("Audit volontairement indisponible");
    try {
      await expect(prisma.$transaction(async (tx) => {
        const failingTx = new Proxy(tx, {
          get(target, property) {
            if (property === "adminAuditLog") return { create: async () => { throw auditFailure; } };
            return Reflect.get(target, property);
          },
        });
        await reviewAthleteImage(failingTx, fixtures.image.id, approve(0), fixtures.admin.id);
      })).rejects.toBe(auditFailure);
      expect(await prisma.athleteImage.findUniqueOrThrow({ where: { id: fixtures.image.id } })).toMatchObject({ approvedForDisplay: false, version: 0, reviewedById: null });
      expect(await prisma.adminAuditLog.count({ where: { entityId: fixtures.image.id } })).toBe(0);
    } finally {
      await prisma.$transaction(async (tx) => {
        await tx.adminAuditLog.deleteMany({ where: { actorId: fixtures.admin.id } });
        await tx.athleteImage.delete({ where: { id: fixtures.image.id } });
        await tx.athlete.delete({ where: { id: fixtures.athlete.id } });
        await tx.sport.delete({ where: { id: fixtures.sport.id } });
        await tx.user.deleteMany({ where: { id: { in: [fixtures.admin.id, fixtures.player.id] } } });
      });
    }
  });

  it("ne valide qu’une décision parmi deux approbations concurrentes", async () => {
    const fixtures = await prisma.$transaction(fixture);
    try {
      const results = await Promise.allSettled([
        prisma.$transaction((tx) => reviewAthleteImage(tx, fixtures.image.id, approve(0), fixtures.admin.id)),
        prisma.$transaction((tx) => reviewAthleteImage(tx, fixtures.image.id, approve(0), fixtures.admin.id)),
      ]);
      expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
      const failure = results.find((result) => result.status === "rejected");
      expect(failure?.status === "rejected" ? failure.reason : null).toMatchObject({ code: "IMAGE_VERSION_CONFLICT" });
      expect(await prisma.adminAuditLog.count({ where: { entityId: fixtures.image.id } })).toBe(1);
    } finally {
      await prisma.$transaction(async (tx) => {
        await tx.adminAuditLog.deleteMany({ where: { actorId: fixtures.admin.id } });
        await tx.athleteImage.delete({ where: { id: fixtures.image.id } });
        await tx.athlete.delete({ where: { id: fixtures.athlete.id } });
        await tx.sport.delete({ where: { id: fixtures.sport.id } });
        await tx.user.deleteMany({ where: { id: { in: [fixtures.admin.id, fixtures.player.id] } } });
      });
    }
  });
});
