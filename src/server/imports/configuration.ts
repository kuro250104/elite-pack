import "server-only";
import { ApiError } from "@/lib/api/errors";

export type SportsDbMode = "development" | "personal";
type Environment = { THESPORTSDB_API_KEY?: string; THESPORTSDB_MODE?: string; NODE_ENV?: string };
// 123 is documented currently; 3 is a historical public test key, never a personal secret.
const publicKeys = new Set(["123", "3"]);
function resolve(env: Environment) {
  const apiKey = env.THESPORTSDB_API_KEY?.trim();
  const mode = env.THESPORTSDB_MODE;
  if (!apiKey || !/^\d+$/.test(apiKey) || (mode !== "development" && mode !== "personal")) return null;
  const isPublic = publicKeys.has(apiKey);
  if (mode === "personal" && isPublic) return null;
  if (mode === "development" && (!isPublic || env.NODE_ENV === "production")) return null;
  if (env.NODE_ENV === "production" && isPublic) return null;
  return { apiKey, mode } as { apiKey: string; mode: SportsDbMode };
}
/** Safe status for the UI and diagnostic output: never contains the key. */
export function getSportsDbConfigurationStatus(env: Environment = process.env): { configured: boolean; mode: SportsDbMode | null } {
  const configuration = resolve(env);
  return { configured: configuration !== null, mode: configuration?.mode ?? null };
}
/** Server-only configuration; call before any provider request. */
export function requireSportsDbConfiguration(env: Environment = process.env) {
  const configuration = resolve(env);
  if (!configuration) throw new ApiError("PROVIDER_NOT_CONFIGURED", "Configurez un mode TheSportsDB valide et sa clé serveur. La clé publique de développement est interdite en production.", 503);
  return configuration;
}
