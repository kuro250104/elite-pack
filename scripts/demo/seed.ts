import { config } from "dotenv";
import { parseArgs } from "node:util";
import { db } from "../../src/lib/db/prisma";
import { ApiError } from "../../src/lib/api/errors";
import { seedDemoCatalogue } from "../../src/server/game/demo-seed";

config({ path: [".env.local", ".env"], quiet: true });
let connected = false;
try {
  const { values } = parseArgs({ options: { confirm: { type: "boolean" } }, strict: true });
  if (!values.confirm) throw new ApiError("CONFIRMATION_REQUIRED", "Ajoutez --confirm pour charger les données de démonstration.", 400);
  if (process.env.NODE_ENV === "production") throw new ApiError("LOCAL_ONLY", "Les données de démonstration sont réservées au développement local.", 400);
  const host = (() => { try { return new URL(process.env.DATABASE_URL ?? "").hostname; } catch { return ""; } })();
  if (!["localhost", "127.0.0.1", "[::1]"].includes(host)) throw new ApiError("LOCAL_ONLY", "DATABASE_URL doit désigner une base locale (localhost).", 400);
  connected = true;
  const result = await db.$transaction((tx) => seedDemoCatalogue(tx), { timeout: 30_000 });
  console.log(JSON.stringify(result, null, 2));
  console.log("\nCatalogue de démonstration prêt. Créez un compte sur /inscription, puis ouvrez le booster de bienvenue sur /boosters.");
} catch (error) {
  console.error(JSON.stringify({ error: error instanceof ApiError ? error.code : "DEMO_SEED_FAILED",
    message: error instanceof ApiError ? error.message : "Le chargement a échoué. Vérifiez que la base est démarrée, migrée (npm run db:deploy) et initialisée (npm run db:seed)." }));
  process.exitCode = 1;
} finally {
  if (connected) await db.$disconnect().catch(() => undefined);
}
