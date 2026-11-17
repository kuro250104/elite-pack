-- Editions created before RarityValue existed still have baseValue = 0: a bank sale would retire the card for nothing.
-- Same formula as revalueEditions: rarity value × (100 + effective prestige, bounded to 0–100) / 100.
-- Only editions still at 0 are updated; no other data is modified.
UPDATE "CardEdition" e
SET "baseValue" = rv."baseValue" * (100 + LEAST(100, GREATEST(0, COALESCE(a."prestigeOverride", a."prestigeScore")))) / 100,
    "updatedAt" = CURRENT_TIMESTAMP
FROM "Athlete" a, "RarityValue" rv
WHERE a.id = e."athleteId" AND rv.rarity = e.rarity AND e."baseValue" = 0;
