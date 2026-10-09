import "server-only";
import { z } from "zod";
import type { AthleteProvider, ExternalAthlete } from "../types";
import { lookupResponseSchema, searchResponseSchema, sportsResponseSchema, type SportsDbPlayer } from "./schemas";

const optionsSchema = z.object({
  apiKey: z.string().regex(/^\d+$/),
  timeoutMs: z.number().int().min(1).max(30_000).default(8_000),
  minIntervalMs: z.number().int().min(2_100).default(2_100),
  maxRetries: z.number().int().min(0).max(2).default(1),
});

export type SportsDbOptions = z.input<typeof optionsSchema>;

function text(value: string | null | undefined): string | null {
  return value?.trim() || null;
}

function mapPlayer(player: SportsDbPlayer): ExternalAthlete {
  return {
    provider: "thesportsdb", externalId: player.idPlayer, fullName: player.strPlayer,
    sportName: text(player.strSport), nationality: text(player.strNationality),
    birthDate: player.dateBorn && /^\d{4}-\d{2}-\d{2}$/.test(player.dateBorn) ? player.dateBorn : null,
    teamName: text(player.strTeam), position: text(player.strPosition),
    biographyFrench: text(player.strDescriptionFR),
    images: [player.strThumb, player.strCutout].flatMap((value) => {
      const url = z.url().safeParse(value);
      if (!url.success || !["https:", "http:"].includes(new URL(url.data).protocol)) return [];
      return [{ source: "thesportsdb", originalUrl: url.data, license: null,
        attribution: null, usageRestrictions: null, approvedForDisplay: false as const }];
    }),
  };
}

/** Use one instance per import worker. Distributed workers require a shared limiter. */
export class TheSportsDbProvider implements AthleteProvider {
  readonly capabilities = { search: true, lookup: true, listSports: true, athletesBySport: false } as const;
  private readonly options: z.output<typeof optionsSchema>;
  private queue: Promise<unknown> = Promise.resolve();
  private nextRequestAt = 0;

  constructor(options: SportsDbOptions, private readonly fetcher: typeof fetch = fetch) {
    this.options = optionsSchema.parse(options);
  }

  private request(endpoint: string, parameters: Record<string, string> = {}): Promise<unknown> {
    const result = this.queue.then(async () => {
      for (let attempt = 0; attempt <= this.options.maxRetries; attempt++) {
        const wait = this.nextRequestAt - Date.now();
        if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
        this.nextRequestAt = Date.now() + this.options.minIntervalMs;
        const url = new URL(`https://www.thesportsdb.com/api/v1/json/${this.options.apiKey}/${endpoint}`);
        url.search = new URLSearchParams(parameters).toString();
        let response: Response;
        try {
          response = await this.fetcher(url, { cache: "no-store", signal: AbortSignal.timeout(this.options.timeoutMs) });
        } catch {
          // Do not leak the URL: v1 embeds the API key in its path.
          throw new Error("Le fournisseur sportif est temporairement indisponible.");
        }
        if (response.ok) {
          try {
            return await response.json();
          } catch {
            throw new Error("Le fournisseur sportif a renvoyé une réponse illisible.");
          }
        }
        const retryable = response.status === 429 || response.status >= 500;
        // The provider documents a one-minute recovery after HTTP 429.
        if (response.status === 429) {
          const retryAfter = Number(response.headers.get("retry-after"));
          this.nextRequestAt = Date.now() + Math.max(60_000, Number.isFinite(retryAfter) ? Math.min(retryAfter * 1000, 120_000) : 60_000);
        }
        if (!retryable || attempt === this.options.maxRetries) {
          throw new Error(`Le fournisseur sportif a refusé la requête (${response.status}).`);
        }
      }
      throw new Error("Le fournisseur sportif est indisponible.");
    });
    this.queue = result.catch(() => undefined);
    return result;
  }

  async getAthlete(id: string): Promise<ExternalAthlete | null> {
    const validId = z.string().regex(/^\d+$/).parse(id);
    const data = lookupResponseSchema.parse(await this.request("lookupplayer.php", { id: validId }));
    return data.players?.[0] ? mapPlayer(data.players[0]) : null;
  }

  async searchAthletes(query: string): Promise<ExternalAthlete[]> {
    const validQuery = z.string().trim().min(2).max(120).parse(query);
    const data = searchResponseSchema.parse(await this.request("searchplayers.php", { p: validQuery }));
    return (data.player ?? []).map(mapPlayer);
  }

  async getSports() {
    const data = sportsResponseSchema.parse(await this.request("all_sports.php"));
    return (data.sports ?? []).map((sport) => ({ externalId: sport.idSport,
      providerName: sport.strSport, category: text(sport.strFormat) }));
  }
}
