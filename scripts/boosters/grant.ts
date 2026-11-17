import { config } from "dotenv";
import { randomUUID } from "node:crypto";
import { parseArgs } from "node:util";
import { z } from "zod";
import { db } from "../../src/lib/db/prisma";
import { ApiError } from "../../src/lib/api/errors";
import { grantBoostersToAll } from "../../src/server/admin/grants";

config({ path: [".env.local", ".env"], quiet: true });
let connected = false;
try {
  const { values } = parseArgs({ options: { "actor-id": { type: "string" }, quantity: { type: "string" }, key: { type: "string" }, confirm: { type: "boolean" } }, strict: true });
  if (!values.confirm) throw new ApiError("CONFIRMATION_REQUIRED", "Ajoutez --confirm pour offrir des boosters à tous les joueurs.", 400);
  const actorId = z.string().min(1).max(100).parse(values["actor-id"]);
  const quantity = z.coerce.number().int().parse(values.quantity ?? "10");
  // Reusing the printed key replays the grant without giving the boosters twice.
  const key = values.key ?? randomUUID();
  connected = true;
  const result = await db.$transaction((tx) => grantBoostersToAll(tx, actorId, { quantity }, key), { timeout: 30_000 });
  console.log(JSON.stringify({ ...result, key }));
} catch (error) {
  console.error(JSON.stringify({ error: error instanceof ApiError ? error.code : error instanceof z.ZodError ? "INVALID_INPUT" : "GRANT_FAILED",
    message: error instanceof ApiError ? error.message : "Le don a échoué. Vérifiez les paramètres et la base locale." }));
  process.exitCode = 1;
} finally {
  if (connected) await db.$disconnect().catch(() => undefined);
}
