/** Foundation contracts only: no opening implementation is exposed yet. */
export interface OpenBoosterCommand {
  /** Must come from the verified server session, never the request body. */
  actorId: string;
  boosterTypeId: string;
  /** Chosen at opening time; passive stock is generic. */
  sportId?: string;
  idempotencyKey: string;
}

export interface PassiveBoosterSnapshot {
  stock: number;
  maxStock: number;
  intervalSeconds: number;
  nextGenerationAt: Date | null;
}
