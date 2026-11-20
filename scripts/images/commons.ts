import { config } from "dotenv";
import { parseArgs } from "node:util";
import { z } from "zod";
import { db } from "../../src/lib/db/prisma";
import { ApiError } from "../../src/lib/api/errors";
import { runCommonsImageImport } from "../../src/server/images/commons-import";

config({ path: [".env.local", ".env"], quiet: true });
let connected = false;
try {
  const { values } = parseArgs({ options: { "actor-id": { type: "string" }, limit: { type: "string" }, sport: { type: "string" }, "no-approve": { type: "boolean" },
    confirm: { type: "boolean" } }, strict: true });
  if (!values.confirm) throw new ApiError("CONFIRMATION_REQUIRED", "Ajoutez --confirm pour rechercher et enregistrer les portraits Commons.", 400);
  const actorId = z.string().min(1).max(100).parse(values["actor-id"]);
  connected = true;
  const summary = await runCommonsImageImport(actorId, { ...(values.limit ? { limit: Number(values.limit) } : {}), ...(values.sport ? { sportId: values.sport } : {}), autoApprove: !values["no-approve"] },
    // Progress on stderr: names and statuses only, never URLs or credits.
    { onEvent: (event) => console.error(`${event.done}/${event.total} ${event.name} : ${event.status}${event.error ? ` (${event.error})` : ""}`) });
  console.log(JSON.stringify(summary));
  if (summary.failed) process.exitCode = 1;
} catch (error) {
  console.error(JSON.stringify({ error: error instanceof ApiError ? error.code : error instanceof z.ZodError ? "INVALID_INPUT" : "COMMONS_IMPORT_FAILED",
    message: error instanceof ApiError ? error.message : "La recherche des portraits a échoué. Vérifiez les paramètres et la base locale." }));
  process.exitCode = 1;
} finally {
  if (connected) await db.$disconnect().catch(() => undefined);
}
