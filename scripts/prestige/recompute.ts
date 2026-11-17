import { config } from "dotenv";
import { parseArgs } from "node:util";
import { z } from "zod";
import { db } from "../../src/lib/db/prisma";
import { ApiError } from "../../src/lib/api/errors";
import { recomputeSportPrestige } from "../../src/server/athletes/prestige";
import { assertAdminActor } from "../../src/server/sports/service";

config({ path: [".env.local", ".env"], quiet: true });
let connected = false;
try {
  const { values } = parseArgs({ options: { "actor-id": { type: "string" }, confirm: { type: "boolean" } }, strict: true });
  if (!values.confirm) throw new ApiError("CONFIRMATION_REQUIRED", "Ajoutez --confirm pour recalculer le prestige de tous les sports.", 400);
  const actorId = z.string().min(1).max(100).parse(values["actor-id"]);
  connected = true;
  await db.$transaction((tx) => assertAdminActor(tx, actorId));
  // No network call: scores come from the honours already stored by the imports. One transaction per sport.
  const sports = await db.sport.findMany({ select: { id: true }, orderBy: { id: "asc" } });
  const results = [];
  for (const sport of sports) results.push(await db.$transaction((tx) => recomputeSportPrestige(tx, sport.id, actorId), { timeout: 15_000 }));
  console.log(JSON.stringify({ sports: results.length, athletes: results.reduce((sum, result) => sum + result.athletes, 0),
    changed: results.reduce((sum, result) => sum + result.changed, 0) }));
} catch (error) {
  console.error(JSON.stringify({ error: error instanceof ApiError ? error.code : error instanceof z.ZodError ? "INVALID_INPUT" : "PRESTIGE_FAILED",
    message: error instanceof ApiError ? error.message : "Le recalcul a échoué. Vérifiez les paramètres et la base locale." }));
  process.exitCode = 1;
} finally {
  if (connected) await db.$disconnect().catch(() => undefined);
}
