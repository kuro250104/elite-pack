import { config } from "dotenv";
import { parseArgs } from "node:util";
import { z } from "zod";
import { db } from "../../src/lib/db/prisma";
import { ApiError } from "../../src/lib/api/errors";
import { requireSportsDbConfiguration } from "../../src/server/imports/configuration";
import { runBulkImport } from "../../src/server/imports/bulk";

config({ path: [".env.local", ".env"], quiet: true });
let connected = false;
try {
  const { values } = parseArgs({ options: {
    "actor-id": { type: "string" }, league: { type: "string", multiple: true }, "no-honours": { type: "boolean" },
    "refresh-existing": { type: "boolean" }, "missing-honours": { type: "boolean" }, "activate-sports": { type: "boolean" }, "no-booster": { type: "boolean" },
    "interval-ms": { type: "string" }, confirm: { type: "boolean" },
  }, strict: true });
  if (!values.confirm) throw new ApiError("CONFIRMATION_REQUIRED", "Ajoutez --confirm pour lancer l’import en masse.", 400);
  requireSportsDbConfiguration();
  const actorId = z.string().min(1).max(100).parse(values["actor-id"]);
  connected = true;
  const summary = await runBulkImport(actorId, {
    leagues: values.league ?? [], honours: !values["no-honours"], refreshExisting: Boolean(values["refresh-existing"] || values["missing-honours"]), missingHonoursOnly: Boolean(values["missing-honours"]),
    activateSports: Boolean(values["activate-sports"]), ...(values["no-booster"] ? { boosterTypeId: null } : {}),
    ...(values["interval-ms"] ? { minIntervalMs: Number(values["interval-ms"]) } : {}),
  }, { onEvent: (event) => {
    // Progress on stderr, names and counters only: no biography, image URL or credential.
    if (event.type === "league") console.error(`Ligue ${event.league} : ${event.teams} équipes`);
    else if (event.type === "team") console.error(`  ${event.team} : ${event.players} joueurs`);
    else if (event.type === "waiting") console.error(`  Quota du fournisseur : pause de ${event.seconds} s`);
    else if (event.status === "failed") console.error(`    échec ${event.name} (${event.error})`);
  } });
  console.log(JSON.stringify(summary));
  if (summary.failures.length) process.exitCode = 1;
} catch (error) {
  console.error(JSON.stringify({ error: error instanceof ApiError ? error.code : error instanceof z.ZodError ? "INVALID_INPUT" : "BULK_IMPORT_FAILED",
    message: error instanceof ApiError ? error.message : "L’import en masse a échoué. Vérifiez les paramètres et la configuration." }));
  process.exitCode = 1;
} finally {
  if (connected) await db.$disconnect().catch(() => undefined);
}
