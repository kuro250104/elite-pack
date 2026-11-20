export interface ExternalImageReference {
  source: string;
  originalUrl: string;
  license: string | null;
  attribution: string | null;
  usageRestrictions: string | null;
  approvedForDisplay: false;
}

export interface ExternalAthlete {
  provider: string;
  externalId: string;
  fullName: string;
  sportName: string | null;
  nationality: string | null;
  birthDate: string | null;
  teamName: string | null;
  position: string | null;
  biographyFrench: string | null;
  images: ExternalImageReference[];
  /** Absent when the honours were not fetched; an empty list means the provider has none. */
  honours?: ExternalHonour[];
}

export interface ExternalHonour {
  externalId: string;
  title: string;
  season: string | null;
  team: string | null;
}

export interface ExternalTeam {
  externalId: string;
  name: string;
  sportName: string | null;
}

export interface ExternalSport {
  externalId: string;
  providerName: string;
  category: string | null;
}

/** Capabilities reflect the provider API; exhaustive sport imports are not assumed. */
export interface AthleteProvider {
  readonly capabilities: {
    search: boolean;
    lookup: boolean;
    listSports: boolean;
    athletesBySport: false;
    honours?: boolean;
    /** Teams of a league and players of a team (bounded lists, never assumed exhaustive). */
    teams?: boolean;
  };
  getAthlete(id: string): Promise<ExternalAthlete | null>;
  searchAthletes(query: string): Promise<ExternalAthlete[]>;
  getSports(): Promise<ExternalSport[]>;
  getHonours?(id: string): Promise<ExternalHonour[]>;
  getTeamsByLeague?(league: string): Promise<ExternalTeam[]>;
  /** Athletes of a team; staff members (coaches, managers) are excluded. */
  getTeamPlayers?(teamId: string): Promise<ExternalAthlete[]>;
}

/** Provider HTTP refusal; the status lets batch imports wait after a 429 instead of failing. */
export class ProviderRequestError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "ProviderRequestError";
  }
}
