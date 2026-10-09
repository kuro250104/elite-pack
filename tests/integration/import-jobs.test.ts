import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import type { AthleteProvider, ExternalAthlete } from "@/providers/types";
import { runImport } from "@/server/imports/service";
import { afterAll, describe, expect, it, vi } from "vitest";
const connectionString = process.env.TEST_DATABASE_URL;
if (!connectionString) throw new Error("TEST_DATABASE_URL est obligatoire.");
const client = new PrismaClient({adapter: new PrismaPg({connectionString})});
afterAll(async () => client.$disconnect());
function source(providerName: string, externalId: string): ExternalAthlete {
  return {provider: "thesportsdb", externalId, fullName: `Athlète ${randomUUID()}`, sportName: providerName,
    nationality: null, birthDate: null, teamName: null, position: null, biographyFrench: null, images: []};
}
describe("historique et idempotence d’import", () => {
  it("journalise une réussite, rejoue sans réseau, refuse une clé réutilisée et annule un échec", async () => {
    const token = randomUUID();
    const admin = await client.user.create({data: {role: "ADMIN"}});
    const sport = await client.sport.create({data: {slug: `jobs-test-${token}`, providerName: `Sport ${token}`, nameFr: "Sport de test"}});
    const athlete = source(sport.providerName, "777");
    const getAthlete = vi.fn().mockResolvedValue(athlete);
    const provider: AthleteProvider = {capabilities: {lookup: true, search: true, listSports: true, athletesBySport: false},
      getAthlete, getSports: async () => [], searchAthletes: async () => []};
    const dependencies = {client, provider: () => provider, reserveProvider: async () => {}};
    try {
      const key = randomUUID();
      const first = await runImport(admin.id, key, {kind: "athlete", externalId: "777"}, dependencies);
      expect(first.job).toMatchObject({status: "COMPLETED", processedCount: 1, actorId: admin.id});
      const replay = await runImport(admin.id, key, {kind: "athlete", externalId: "777"}, dependencies);
      expect(replay).toMatchObject({replay: true, job: {id: first.job.id}});
      expect(getAthlete).toHaveBeenCalledTimes(1);
      await expect(runImport(admin.id, key, {kind: "sports"}, dependencies)).rejects.toMatchObject({code: "IDEMPOTENCY_CONFLICT"});
      getAthlete.mockResolvedValue({...athlete, externalId: "778", fullName: "Homonyme", sportName: `Inconnu ${token}`});
      const failed = await runImport(admin.id, randomUUID(), {kind: "athlete", externalId: "778"}, dependencies);
      expect(failed.job).toMatchObject({status: "FAILED", processedCount: 0, result: {errorCode: "SPORT_MAPPING_REQUIRED"}});
      expect(await client.athleteExternalId.count({where: {provider: "THESPORTSDB", externalId: "778"}})).toBe(0);
      getAthlete.mockRejectedValue(new Error("Secret: /987654/provider"));
      const networkKey = randomUUID();
      const networkFailure = await runImport(admin.id, networkKey, {kind: "athlete", externalId: "779"}, dependencies);
      expect(networkFailure.job.status).toBe("FAILED");
      expect(networkFailure.job.errorMessage).not.toContain("987654");
      await runImport(admin.id, networkKey, {kind: "athlete", externalId: "779"}, dependencies);
      expect(getAthlete).toHaveBeenCalledTimes(3);
      expect(await client.importJob.count({where: {actorId: admin.id}})).toBe(3);
      expect(await client.adminAuditLog.count({where: {actorId: admin.id, entityType: "ImportJob"}})).toBe(6);
    } finally {
      await client.$transaction(async tx => {
        await tx.adminAuditLog.deleteMany({where: {actorId: admin.id}});
        await tx.importJob.deleteMany({where: {actorId: admin.id}});
        await tx.athlete.deleteMany({where: {sportId: sport.id}});
        await tx.sport.delete({where: {id: sport.id}});
        await tx.user.delete({where: {id: admin.id}});
      });
    }
  });
  it("deux demandes concurrentes utilisent un seul job et un seul appel fournisseur", async () => {
    const admin = await client.user.create({data: {role: "ADMIN"}});
    const key = randomUUID();
    const getSports = vi.fn(async () => []);
    const provider: AthleteProvider = {capabilities: {lookup: true, search: true, listSports: true, athletesBySport: false},
      getSports, getAthlete: async () => null, searchAthletes: async () => []};
    const dependencies = {client, provider: () => provider, reserveProvider: async () => {}};
    try {
      const results = await Promise.all([runImport(admin.id, key, {kind: "sports"}, dependencies), runImport(admin.id, key, {kind: "sports"}, dependencies)]);
      expect(new Set(results.map(result => result.job.id)).size).toBe(1);
      expect(results.filter(result => result.replay)).toHaveLength(1);
      expect(getSports).toHaveBeenCalledTimes(1);
      const job = await client.importJob.findFirstOrThrow({where: {actorId: admin.id}});
      expect(job.status).toBe("COMPLETED");
      const staleKey = randomUUID();
      await client.importJob.create({data: {actorId: admin.id, idempotencyKey: staleKey, provider: "THESPORTSDB", status: "RUNNING", parameters: {kind: "sports"}, startedAt: new Date(Date.now() - 180_000)}});
      expect((await runImport(admin.id, staleKey, {kind: "sports"}, dependencies)).job).toMatchObject({status: "FAILED", result: {errorCode: "IMPORT_INTERRUPTED"}});
      expect(getSports).toHaveBeenCalledTimes(1);
    } finally {
      await client.$transaction(async tx => {
        await tx.adminAuditLog.deleteMany({where: {actorId: admin.id}});
        await tx.importJob.deleteMany({where: {actorId: admin.id}});
        await tx.user.delete({where: {id: admin.id}});
      });
    }
  });
});
