import { config } from "dotenv";
import { parseArgs } from "node:util";
import { z } from "zod";
import { db } from "../../src/lib/db/prisma";
import { ApiError } from "../../src/lib/api/errors";
import { requireSportsDbConfiguration } from "../../src/server/imports/configuration";
import { syncAthletes } from "../../src/server/imports/sync";

config({ path: [".env.local", ".env"], quiet: true });
let connected = false;
try {
  const { values } = parseArgs({ options: { "actor-id": { type: "string" }, limit: { type: "string" }, "older-than-hours": { type: "string" } }, strict: true });
  requireSportsDbConfiguration();
  const actorId = z.string().min(1).max(100).parse(values["actor-id"]);
  connected = true;
  const summary = await syncAthletes(actorId, { ...(values.limit ? { limit: Number(values.limit) } : {}),
    ...(values["older-than-hours"] ? { olderThanHours: Number(values["older-than-hours"]) } : {}) });
  // Counts and changed field names only: no biography, image URL or credential is printed.
  console.log(JSON.stringify({ ...summary, results: summary.results.map(({ name, status, changed, error }) => ({ name, status, changed, error })) }));
  if (summary.failed) process.exitCode = 1;
} catch (error) {
  console.error(JSON.stringify({ error: error instanceof ApiError ? error.code : error instanceof z.ZodError ? "INVALID_INPUT" : "SYNC_FAILED",
    message: error instanceof ApiError ? error.message : "La synchronisation a échoué. Vérifiez les paramètres et la configuration." }));
  process.exitCode = 1;
} finally {
  if (connected) await db.$disconnect().catch(() => undefined);
}
