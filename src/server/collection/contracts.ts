export interface CollectionQuery {
  /** Set exclusively from the verified server session. */
  actorId: string;
  page: number;
  pageSize: number;
  sportId?: string;
  editionId?: string;
}
