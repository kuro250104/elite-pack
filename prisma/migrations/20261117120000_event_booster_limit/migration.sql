-- Additive: optional per-player purchase limit for event boosters.
ALTER TABLE "BoosterType" ADD COLUMN "maxPerPlayer" INTEGER;
ALTER TABLE "BoosterType" ADD CONSTRAINT "BoosterType_maxPerPlayer_check" CHECK ("maxPerPlayer" IS NULL OR "maxPerPlayer" > 0);
