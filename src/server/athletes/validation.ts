import { z } from "zod";

export const calendarDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}, "La date doit exister dans le calendrier.");
const text = z.string().trim().min(1).max(250);
export const athletePatchSchema = z.object({
  name: text.optional(),
  birthDate: calendarDateSchema.nullable().optional(),
  nationality: text.nullable().optional(),
  currentTeam: text.nullable().optional(),
  position: text.nullable().optional(),
  biography: z.string().trim().max(20_000).nullable().optional(),
  prestigeOverride: z.number().int().min(0).max(100).nullable().optional(),
  active: z.boolean().optional(),
}).strict().refine((value) => Object.keys(value).length > 0, "Indiquez au moins un champ à modifier.");

export const externalAthleteSchema = z.object({
  provider: z.enum(["thesportsdb", "wikidata", "olympedia"]),
  externalId: text,
  fullName: text,
  sportName: text.nullable(),
  nationality: text.nullable(),
  birthDate: calendarDateSchema.nullable(),
  teamName: text.nullable(),
  position: text.nullable(),
  biographyFrench: z.string().trim().max(20_000).nullable(),
  images: z.array(z.object({
    source: text,
    originalUrl: z.url().refine((value) => new URL(value).protocol === "https:", "Une URL HTTPS est requise."),
    license: z.string().nullable(), attribution: z.string().nullable(),
    usageRestrictions: z.string().nullable(), approvedForDisplay: z.literal(false),
  })).max(20),
});
export type AthletePatch = z.infer<typeof athletePatchSchema>;
