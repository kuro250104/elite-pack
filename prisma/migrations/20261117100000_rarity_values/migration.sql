-- Additive migration: configurable base value per rarity (integer coins).
CREATE TABLE "RarityValue" (
    "rarity" "Rarity" NOT NULL,
    "baseValue" BIGINT NOT NULL,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "RarityValue_pkey" PRIMARY KEY ("rarity"),
    CONSTRAINT "RarityValue_baseValue_check" CHECK ("baseValue" >= 0)
);

-- Initial values, editable later from the database without code changes.
INSERT INTO "RarityValue" ("rarity", "baseValue", "updatedAt") VALUES
    ('COMMON', 10, CURRENT_TIMESTAMP),
    ('UNCOMMON', 25, CURRENT_TIMESTAMP),
    ('RARE', 75, CURRENT_TIMESTAMP),
    ('EPIC', 200, CURRENT_TIMESTAMP),
    ('LEGENDARY', 600, CURRENT_TIMESTAMP),
    ('MYTHIC', 2000, CURRENT_TIMESTAMP);
