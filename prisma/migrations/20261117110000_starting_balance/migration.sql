-- New players start with 500 coins so they can use the marketplace before any bank sale.
ALTER TABLE "GameConfiguration" ALTER COLUMN "startingBalance" SET DEFAULT 500;

-- Only an untouched configuration is updated; an administrator's value is kept. Existing wallets are not credited.
UPDATE "GameConfiguration" SET "startingBalance" = 500, "updatedAt" = CURRENT_TIMESTAMP
WHERE "id" = 'default' AND "startingBalance" = 0;
