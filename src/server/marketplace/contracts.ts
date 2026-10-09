/** Implementations must authorize actors and run all state changes in one transaction. */
export interface CreateListingCommand {
  actorId: string;
  cardInstanceId: string;
  price: number;
  idempotencyKey: string;
}

export interface BuyListingCommand {
  actorId: string;
  listingId: string;
  idempotencyKey: string;
}
