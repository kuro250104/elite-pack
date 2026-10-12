import { config } from "dotenv";
import { parseArgs } from "node:util";
import { z } from "zod";
import { ApiError } from "../../src/lib/api/errors";
import { getSportsDbConfigurationStatus, requireSportsDbConfiguration } from "../../src/server/imports/configuration";
import { db } from "../../src/lib/db/prisma";
import { reserveAdminRequest, reserveProviderRequest, configuredProvider, runImport } from "../../src/server/imports/service";

// Load local overrides first; deployment/process variables always retain precedence.
config({ path: [".env.local", ".env"], quiet: true });
let connected = false;
try {
  const { values } = parseArgs({ options: { sports: { type: "boolean" }, athlete: { type: "string" },
    "actor-id": { type: "string" }, "idempotency-key": { type: "string" }, check: { type: "boolean" } }, strict: true });
  const status = getSportsDbConfigurationStatus();
  if (values.check) {
    if (values.sports || values.athlete || values["idempotency-key"]) throw new ApiError("INVALID_INPUT", "Le diagnostic ne peut pas être combiné avec un import.", 400);
    console.log(JSON.stringify({ configured: status.configured, mode: status.mode }));
    requireSportsDbConfiguration();
    const actorId = z.string().min(1).max(100).parse(values["actor-id"]);
    connected = true;
    await reserveAdminRequest(actorId);
    await reserveProviderRequest();
    const sports = await configuredProvider().getSports();
    console.log(JSON.stringify({ database: "accessible", provider: "accessible", sportsAvailable: sports.length, exhaustive: false }));
  } else {
    if (Boolean(values.sports) === Boolean(values.athlete)) throw new ApiError("INVALID_INPUT", "Choisissez uniquement --sports ou --athlete ID.", 400);
    requireSportsDbConfiguration();
    const actorId = z.string().min(1).max(100).parse(values["actor-id"]);
    const key = z.uuid().parse(values["idempotency-key"]);
    const command = values.sports ? { kind: "sports" as const } : { kind: "athlete" as const, externalId: z.string().regex(/^\d{1,20}$/).parse(values.athlete) };
    connected = true;
    await reserveAdminRequest(actorId);
    const { job, replay } = await runImport(actorId, key, command);
    // Never print imported biographies, image URLs, raw provider payloads or credentials.
    console.log(JSON.stringify({ jobId: job.id, status: job.status, processedCount: job.processedCount, replay }));
    if (job.status !== "COMPLETED") process.exitCode = 1;
  }
} catch (error) {
  const code = error instanceof ApiError ? error.code : error instanceof z.ZodError ? "INVALID_INPUT" : "IMPORT_UNAVAILABLE";
  console.error(JSON.stringify({ error: code, message: "L’opération n’a pas abouti. Vérifiez les paramètres, le rôle administrateur et la configuration serveur." }));
  process.exitCode = 1;
} finally {
  if (connected) await db.$disconnect().catch(() => undefined);
}
