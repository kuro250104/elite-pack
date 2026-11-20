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
  /** "Active", "Coaching", "Retired"…: staff listed with a team are not athletes. */
  strStatus: optionalText,
});

export const lookupResponseSchema = z.object({ players: z.array(playerSchema).nullable() });
export const searchResponseSchema = z.object({ player: z.array(playerSchema).nullable() });
/** search_all_teams.php; the free key returns at most ten teams per league. */
export const teamsResponseSchema = z.object({
  teams: z.array(z.object({
    idTeam: z.string().regex(/^\d+$/),
    strTeam: z.string().trim().min(1),
    strSport: optionalText,
  })).nullable(),
});
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
