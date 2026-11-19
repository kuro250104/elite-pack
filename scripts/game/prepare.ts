import { config } from "dotenv";
import { parseArgs } from "node:util";
import { z } from "zod";
import { db } from "../../src/lib/db/prisma";
import { ApiError } from "../../src/lib/api/errors";
import { prepareDemoCatalogue } from "../../src/server/game/demo-catalogue";

config({ path: [".env.local", ".env"], quiet: true });
let connected = false;
try {
  const { values } = parseArgs({ options: { "actor-id": { type: "string" }, confirm: { type: "boolean" } }, strict: true });
  if (!values.confirm) throw new ApiError("CONFIRMATION_REQUIRED", "Ajoutez --confirm pour préparer le catalogue local.", 400);
  const actorId = z.string().min(1).max(100).parse(values["actor-id"]);
  connected = true;
  const result = await db.$transaction(tx => prepareDemoCatalogue(tx, actorId), { timeout: 15_000 });
  console.log(JSON.stringify(result));
} catch (error) {
  console.error(JSON.stringify({ error: error instanceof ApiError ? error.code : error instanceof z.ZodError ? "INVALID_INPUT" : "PREPARATION_FAILED",
    message: error instanceof ApiError ? error.message : "La préparation a échoué. Vérifiez les paramètres et la base locale." }));
  process.exitCode = 1;
} finally {
  if (connected) await db.$disconnect().catch(() => undefined);
}
