import "server-only";
import { z } from "zod";
import { db } from "@/lib/db/prisma";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import type { CardRarity } from "@/components/cards/athlete-card";
import { calendarDateSchema } from "@/server/athletes/validation";

export const historyQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(10000).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(10),
  sportId: z.string().trim().min(1).max(100).optional(),
  // Calendar days in Europe/Paris, inclusive.
  from: calendarDateSchema.optional(), to: calendarDateSchema.optional(),
}).strict().refine((value) => !value.from || !value.to || value.from <= value.to, { message: "La date de début doit précéder la date de fin.", path: ["to"] });
export type HistoryQuery = z.infer<typeof historyQuerySchema>;

/** Start of a Paris calendar day as an instant, whatever the server time zone. */
const parisClock = new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Paris", hourCycle: "h23",
  year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
function parisOffsetMs(at: Date) {
  const parts = Object.fromEntries(parisClock.formatToParts(at).map((part) => [part.type, Number(part.value)]));
  return Date.UTC(parts.year!, parts.month! - 1, parts.day!, parts.hour!, parts.minute!, parts.second!) - at.getTime();
}
function parisDayStart(day: string) {
  const midnightUtc = new Date(`${day}T00:00:00Z`);
  // Paris changes offset at 2–3 a.m., so the offset in force at midnight is the one of the previous evening.
  return new Date(midnightUtc.getTime() - parisOffsetMs(new Date(midnightUtc.getTime() - 3600 * 1000)));
}

/** The player's openings with the cards each one produced, including cards since sold or traded. */
export async function listOpeningHistory(actorId: string, input: unknown, client: PrismaClient = db) {
  const params = historyQuerySchema.parse(input);
  const openedAt: Prisma.DateTimeFilter = {};
  if (params.from) openedAt.gte = parisDayStart(params.from);
  if (params.to) {
    // Exclusive end: start of the following Paris day (23 or 25 hours long on daylight-saving days).
    const next = new Date(`${params.to}T00:00:00Z`); next.setUTCDate(next.getUTCDate() + 1);
    openedAt.lt = parisDayStart(next.toISOString().slice(0, 10));
  }
  const where: Prisma.BoosterOpeningWhereInput = { userId: actorId, ...(params.sportId ? { selectedSportId: params.sportId } : {}),
    ...(params.from || params.to ? { openedAt } : {}) };
  const [openings, total] = await Promise.all([
    client.boosterOpening.findMany({ where, orderBy: [{ openedAt: "desc" }, { id: "desc" }], take: params.pageSize, skip: (params.page - 1) * params.pageSize,
      select: { id: true, openedAt: true, usedPassiveStock: true, boosterType: { select: { nameFr: true } }, selectedSport: { select: { nameFr: true } },
        cards: { orderBy: { id: "asc" }, select: { id: true, ownerId: true, retiredAt: true,
          edition: { select: { name: true, rarity: true, athlete: { select: { id: true, name: true, sport: { select: { nameFr: true } } } } } } } } } }),
    client.boosterOpening.count({ where }),
  ]);
  return {
    total, page: params.page, pageSize: params.pageSize,
    openings: openings.map((opening) => ({ id: opening.id, openedAt: opening.openedAt.toISOString(), booster: opening.boosterType.nameFr,
      source: opening.usedPassiveStock ? "passive" as const : "gift" as const, sport: opening.selectedSport?.nameFr ?? null,
      cards: opening.cards.map((card) => ({ id: card.id, athleteId: card.edition.athlete.id, name: card.edition.athlete.name,
        sport: card.edition.athlete.sport.nameFr, editionName: card.edition.name, rarity: card.edition.rarity as CardRarity,
        // Ownership can change after the opening: the history keeps the card and tells where it is now.
        status: card.ownerId === actorId ? "owned" as const : card.retiredAt ? "sold-to-bank" as const : "traded" as const })) })),
  };
}
