import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import type { ExternalAthlete, ExternalSport } from "@/providers/types";
import { applyExternalAthlete } from "@/server/athletes/service";
import { importSports } from "@/server/sports/service";
import { prepareDemoCatalogue } from "./demo-catalogue";

/** Technical operator for local demonstration data: no e-mail, password, OAuth account or session, so it cannot sign in. */
export const demoOperatorId = "local-demo-operator";

// Snapshot of TheSportsDB (all_sports.php and lookupplayer.php, public key) taken on 2026-11-19.
// Replaying it goes through the real import services without any network call.
const demoSports: ExternalSport[] = [
  { externalId: "102", providerName: "Soccer", category: null },
  { externalId: "103", providerName: "Motorsport", category: null },
];
const demoAthletes: ExternalAthlete[] = [
  { provider: "thesportsdb", externalId: "34162098", fullName: "Kylian Mbappé", sportName: "Soccer", nationality: "France",
    birthDate: "1998-12-20", teamName: "Real Madrid", position: "Centre-Forward", biographyFrench: null, images: [] },
  { provider: "thesportsdb", externalId: "34157136", fullName: "Lewis Hamilton", sportName: "Motorsport", nationality: "United Kingdom",
    birthDate: "1985-01-07", teamName: "Scuderia Ferrari HP", position: "Driver", biographyFrench: null, images: [] },
];

/**
 * Loads a playable local catalogue in one transaction: two sports, two real athletes and the
 * "Découverte multisport" booster with twelve editions. Idempotent; an athlete already imported
 * (by this seed or by a real import) is left untouched, and administrator changes are preserved.
 */
export async function seedDemoCatalogue(tx: Prisma.TransactionClient) {
  await tx.user.upsert({ where: { id: demoOperatorId }, update: {},
    create: { id: demoOperatorId, name: "Opérateur de démonstration (local)", role: "ADMIN" } });
  const sports = await importSports(tx, demoSports, demoOperatorId);
  const athletes: { name: string; action: "created" | "existing" }[] = [];
  for (const athlete of demoAthletes) {
    const known = await tx.athleteExternalId.findUnique({
      where: { provider_externalId: { provider: "THESPORTSDB", externalId: athlete.externalId } } });
    if (!known) await applyExternalAthlete(tx, athlete, { actorId: demoOperatorId });
    athletes.push({ name: athlete.fullName, action: known ? "existing" : "created" });
  }
  const catalogue = await prepareDemoCatalogue(tx, demoOperatorId);
  return { sportsCreated: sports.created, athletes, catalogue };
}
