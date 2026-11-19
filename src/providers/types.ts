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
  };
  getAthlete(id: string): Promise<ExternalAthlete | null>;
  searchAthletes(query: string): Promise<ExternalAthlete[]>;
  getSports(): Promise<ExternalSport[]>;
  getHonours?(id: string): Promise<ExternalHonour[]>;
}
