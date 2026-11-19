import { z } from "zod";

const optionalText = z.string().nullish();

export const playerSchema = z.object({
  idPlayer: z.string().regex(/^\d+$/),
  strPlayer: z.string().trim().min(1),
  strSport: optionalText,
  strNationality: optionalText,
  dateBorn: optionalText,
  strTeam: optionalText,
  strPosition: optionalText,
  strDescriptionFR: optionalText,
  strThumb: optionalText,
  strCutout: optionalText,
});

export const lookupResponseSchema = z.object({ players: z.array(playerSchema).nullable() });
export const searchResponseSchema = z.object({ player: z.array(playerSchema).nullable() });
export const sportsResponseSchema = z.object({
  sports: z.array(z.object({
    idSport: z.string().regex(/^\d+$/),
    strSport: z.string().trim().min(1),
    strFormat: optionalText,
  })).nullable(),
});

/** lookuphonours.php; the free key returns at most five honours per player. */
export const honoursResponseSchema = z.object({
  honours: z.array(z.object({
    idHonour: z.string().regex(/^\d+$/),
    strHonour: z.string().trim().min(1),
    strSeason: optionalText,
    strTeam: optionalText,
  })).nullable(),
});

export type SportsDbPlayer = z.infer<typeof playerSchema>;
