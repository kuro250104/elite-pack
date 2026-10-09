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
  };
  getAthlete(id: string): Promise<ExternalAthlete | null>;
  searchAthletes(query: string): Promise<ExternalAthlete[]>;
  getSports(): Promise<ExternalSport[]>;
}
