-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('PLAYER', 'ADMIN');

-- CreateEnum
CREATE TYPE "Rarity" AS ENUM ('COMMON', 'UNCOMMON', 'RARE', 'EPIC', 'LEGENDARY', 'MYTHIC');

-- CreateEnum
CREATE TYPE "AcquisitionSource" AS ENUM ('BOOSTER', 'MARKETPLACE', 'REWARD', 'ADMIN');

-- CreateEnum
CREATE TYPE "ListingStatus" AS ENUM ('ACTIVE', 'SOLD', 'CANCELLED');

-- CreateEnum
CREATE TYPE "WalletTransactionType" AS ENUM ('INITIAL_BALANCE', 'REWARD', 'BANK_SALE', 'MARKETPLACE_SALE', 'MARKETPLACE_PURCHASE', 'BOOSTER_PURCHASE', 'ADMIN_ADJUSTMENT');

-- CreateEnum
CREATE TYPE "BoosterCategory" AS ENUM ('SPORT', 'MULTISPORT', 'EVENT');

-- CreateEnum
CREATE TYPE "DataProvider" AS ENUM ('THESPORTSDB', 'WIKIDATA', 'OLYMPEDIA');

-- CreateEnum
CREATE TYPE "ImportStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT,
    "emailVerified" TIMESTAMPTZ(3),
    "image" TEXT,
    "role" "Role" NOT NULL DEFAULT 'PLAYER',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationToken" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMPTZ(3) NOT NULL
);

-- CreateTable
CREATE TABLE "Sport" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "nameFr" TEXT NOT NULL,
    "providerName" TEXT NOT NULL,
    "providerId" TEXT,
    "category" TEXT,
    "icon" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Sport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Athlete" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "birthDate" DATE,
    "nationality" TEXT,
    "sportId" TEXT NOT NULL,
    "currentTeam" TEXT,
    "position" TEXT,
    "biography" TEXT,
    "statistics" JSONB,
    "achievements" JSONB,
    "prestigeScore" INTEGER NOT NULL DEFAULT 0,
    "prestigeOverride" INTEGER,
    "administratorOverrides" JSONB,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Athlete_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AthleteExternalId" (
    "id" TEXT NOT NULL,
    "athleteId" TEXT NOT NULL,
    "provider" "DataProvider" NOT NULL,
    "externalId" TEXT NOT NULL,
    "importedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AthleteExternalId_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AthleteImage" (
    "id" TEXT NOT NULL,
    "athleteId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "originalUrl" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "license" TEXT,
    "licenseUrl" TEXT,
    "attribution" TEXT,
    "usageRestrictions" TEXT,
    "approvedForDisplay" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "AthleteImage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CardEdition" (
    "id" TEXT NOT NULL,
    "athleteId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "rarity" "Rarity" NOT NULL,
    "visualDesign" JSONB,
    "baseValue" BIGINT NOT NULL DEFAULT 0,
    "maxSupply" INTEGER,
    "mintedSupply" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT false,
    "releaseDate" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "season" TEXT,
    "competition" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "CardEdition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CardInstance" (
    "id" TEXT NOT NULL,
    "editionId" TEXT NOT NULL,
    "ownerId" TEXT,
    "serialNumber" INTEGER,
    "mintedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acquiredAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acquisitionSource" "AcquisitionSource" NOT NULL,
    "retiredAt" TIMESTAMPTZ(3),
    "openingId" TEXT,

    CONSTRAINT "CardInstance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CardDiscovery" (
    "userId" TEXT NOT NULL,
    "editionId" TEXT NOT NULL,
    "discoveredAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CardDiscovery_pkey" PRIMARY KEY ("userId","editionId")
);

-- CreateTable
CREATE TABLE "GameConfiguration" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "passiveIntervalSeconds" INTEGER NOT NULL DEFAULT 900,
    "passiveMaxStock" INTEGER NOT NULL DEFAULT 10,
    "startingBalance" BIGINT NOT NULL DEFAULT 0,
    "bankResaleBasisPoints" INTEGER NOT NULL DEFAULT 6000,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "GameConfiguration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PassiveBoosterState" (
    "userId" TEXT NOT NULL,
    "stock" INTEGER NOT NULL DEFAULT 0,
    "nextGenerationAt" TIMESTAMPTZ(3),
    "generatedTotal" BIGINT NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "PassiveBoosterState_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "BoosterType" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "nameFr" TEXT NOT NULL,
    "category" "BoosterCategory" NOT NULL,
    "cardCount" INTEGER NOT NULL DEFAULT 5,
    "price" BIGINT NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT false,
    "startsAt" TIMESTAMPTZ(3),
    "endsAt" TIMESTAMPTZ(3),
    "season" TEXT,
    "competition" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "BoosterType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BoosterSport" (
    "boosterTypeId" TEXT NOT NULL,
    "sportId" TEXT NOT NULL,

    CONSTRAINT "BoosterSport_pkey" PRIMARY KEY ("boosterTypeId","sportId")
);

-- CreateTable
CREATE TABLE "BoosterEdition" (
    "boosterTypeId" TEXT NOT NULL,
    "editionId" TEXT NOT NULL,

    CONSTRAINT "BoosterEdition_pkey" PRIMARY KEY ("boosterTypeId","editionId")
);

-- CreateTable
CREATE TABLE "BoosterRarityWeight" (
    "boosterTypeId" TEXT NOT NULL,
    "rarity" "Rarity" NOT NULL,
    "weightBasisPoints" INTEGER NOT NULL,

    CONSTRAINT "BoosterRarityWeight_pkey" PRIMARY KEY ("boosterTypeId","rarity")
);

-- CreateTable
CREATE TABLE "BoosterInventory" (
    "userId" TEXT NOT NULL,
    "boosterTypeId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "BoosterInventory_pkey" PRIMARY KEY ("userId","boosterTypeId")
);

-- CreateTable
CREATE TABLE "BoosterOpening" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "boosterTypeId" TEXT NOT NULL,
    "selectedSportId" TEXT,
    "usedPassiveStock" BOOLEAN NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "configurationSnapshot" JSONB NOT NULL,
    "openedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BoosterOpening_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Wallet" (
    "userId" TEXT NOT NULL,
    "balance" BIGINT NOT NULL DEFAULT 0,
    "lifetimeEarnings" BIGINT NOT NULL DEFAULT 0,
    "lifetimeSpending" BIGINT NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Wallet_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "WalletTransaction" (
    "id" TEXT NOT NULL,
    "walletId" TEXT NOT NULL,
    "type" "WalletTransactionType" NOT NULL,
    "amount" BIGINT NOT NULL,
    "balanceAfter" BIGINT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "referenceId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WalletTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketplaceListing" (
    "id" TEXT NOT NULL,
    "cardInstanceId" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "buyerId" TEXT,
    "price" BIGINT NOT NULL,
    "status" "ListingStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMPTZ(3),
    "purchaseIdempotencyKey" TEXT,

    CONSTRAINT "MarketplaceListing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportJob" (
    "id" TEXT NOT NULL,
    "provider" "DataProvider" NOT NULL,
    "status" "ImportStatus" NOT NULL DEFAULT 'PENDING',
    "parameters" JSONB NOT NULL,
    "processedCount" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "startedAt" TIMESTAMPTZ(3),
    "completedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImportJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminAuditLog" (
    "id" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "before" JSONB,
    "after" JSONB,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "Account_userId_idx" ON "Account"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Account_provider_providerAccountId_key" ON "Account"("provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_sessionToken_key" ON "Session"("sessionToken");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_token_key" ON "VerificationToken"("token");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_identifier_token_key" ON "VerificationToken"("identifier", "token");

-- CreateIndex
CREATE UNIQUE INDEX "Sport_slug_key" ON "Sport"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Sport_providerId_key" ON "Sport"("providerId");

-- CreateIndex
CREATE INDEX "Athlete_sportId_idx" ON "Athlete"("sportId");

-- CreateIndex
CREATE INDEX "Athlete_name_idx" ON "Athlete"("name");

-- CreateIndex
CREATE INDEX "Athlete_nationality_idx" ON "Athlete"("nationality");

-- CreateIndex
CREATE UNIQUE INDEX "AthleteExternalId_provider_externalId_key" ON "AthleteExternalId"("provider", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "AthleteExternalId_athleteId_provider_key" ON "AthleteExternalId"("athleteId", "provider");

-- CreateIndex
CREATE UNIQUE INDEX "AthleteImage_athleteId_key" ON "AthleteImage"("athleteId");

-- CreateIndex
CREATE INDEX "CardEdition_athleteId_idx" ON "CardEdition"("athleteId");

-- CreateIndex
CREATE INDEX "CardEdition_rarity_active_idx" ON "CardEdition"("rarity", "active");

-- CreateIndex
CREATE INDEX "CardInstance_ownerId_acquiredAt_idx" ON "CardInstance"("ownerId", "acquiredAt");

-- CreateIndex
CREATE UNIQUE INDEX "CardInstance_editionId_serialNumber_key" ON "CardInstance"("editionId", "serialNumber");

-- CreateIndex
CREATE UNIQUE INDEX "BoosterType_slug_key" ON "BoosterType"("slug");

-- CreateIndex
CREATE INDEX "BoosterOpening_userId_openedAt_idx" ON "BoosterOpening"("userId", "openedAt");

-- CreateIndex
CREATE UNIQUE INDEX "BoosterOpening_userId_idempotencyKey_key" ON "BoosterOpening"("userId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "WalletTransaction_walletId_createdAt_idx" ON "WalletTransaction"("walletId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "WalletTransaction_walletId_idempotencyKey_key" ON "WalletTransaction"("walletId", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "MarketplaceListing_purchaseIdempotencyKey_key" ON "MarketplaceListing"("purchaseIdempotencyKey");

-- CreateIndex
CREATE INDEX "MarketplaceListing_status_price_idx" ON "MarketplaceListing"("status", "price");

-- CreateIndex
CREATE INDEX "MarketplaceListing_sellerId_createdAt_idx" ON "MarketplaceListing"("sellerId", "createdAt");

-- CreateIndex
CREATE INDEX "MarketplaceListing_cardInstanceId_idx" ON "MarketplaceListing"("cardInstanceId");

-- CreateIndex
CREATE INDEX "AdminAuditLog_actorId_createdAt_idx" ON "AdminAuditLog"("actorId", "createdAt");

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Athlete" ADD CONSTRAINT "Athlete_sportId_fkey" FOREIGN KEY ("sportId") REFERENCES "Sport"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AthleteExternalId" ADD CONSTRAINT "AthleteExternalId_athleteId_fkey" FOREIGN KEY ("athleteId") REFERENCES "Athlete"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AthleteImage" ADD CONSTRAINT "AthleteImage_athleteId_fkey" FOREIGN KEY ("athleteId") REFERENCES "Athlete"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CardEdition" ADD CONSTRAINT "CardEdition_athleteId_fkey" FOREIGN KEY ("athleteId") REFERENCES "Athlete"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CardInstance" ADD CONSTRAINT "CardInstance_editionId_fkey" FOREIGN KEY ("editionId") REFERENCES "CardEdition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CardInstance" ADD CONSTRAINT "CardInstance_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CardInstance" ADD CONSTRAINT "CardInstance_openingId_fkey" FOREIGN KEY ("openingId") REFERENCES "BoosterOpening"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CardDiscovery" ADD CONSTRAINT "CardDiscovery_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CardDiscovery" ADD CONSTRAINT "CardDiscovery_editionId_fkey" FOREIGN KEY ("editionId") REFERENCES "CardEdition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PassiveBoosterState" ADD CONSTRAINT "PassiveBoosterState_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoosterSport" ADD CONSTRAINT "BoosterSport_boosterTypeId_fkey" FOREIGN KEY ("boosterTypeId") REFERENCES "BoosterType"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoosterSport" ADD CONSTRAINT "BoosterSport_sportId_fkey" FOREIGN KEY ("sportId") REFERENCES "Sport"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoosterEdition" ADD CONSTRAINT "BoosterEdition_boosterTypeId_fkey" FOREIGN KEY ("boosterTypeId") REFERENCES "BoosterType"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoosterEdition" ADD CONSTRAINT "BoosterEdition_editionId_fkey" FOREIGN KEY ("editionId") REFERENCES "CardEdition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoosterRarityWeight" ADD CONSTRAINT "BoosterRarityWeight_boosterTypeId_fkey" FOREIGN KEY ("boosterTypeId") REFERENCES "BoosterType"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoosterInventory" ADD CONSTRAINT "BoosterInventory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoosterInventory" ADD CONSTRAINT "BoosterInventory_boosterTypeId_fkey" FOREIGN KEY ("boosterTypeId") REFERENCES "BoosterType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoosterOpening" ADD CONSTRAINT "BoosterOpening_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoosterOpening" ADD CONSTRAINT "BoosterOpening_boosterTypeId_fkey" FOREIGN KEY ("boosterTypeId") REFERENCES "BoosterType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoosterOpening" ADD CONSTRAINT "BoosterOpening_selectedSportId_fkey" FOREIGN KEY ("selectedSportId") REFERENCES "Sport"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Wallet" ADD CONSTRAINT "Wallet_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WalletTransaction" ADD CONSTRAINT "WalletTransaction_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "Wallet"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketplaceListing" ADD CONSTRAINT "MarketplaceListing_cardInstanceId_fkey" FOREIGN KEY ("cardInstanceId") REFERENCES "CardInstance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketplaceListing" ADD CONSTRAINT "MarketplaceListing_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketplaceListing" ADD CONSTRAINT "MarketplaceListing_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminAuditLog" ADD CONSTRAINT "AdminAuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Invariants PostgreSQL complémentaires non représentables dans le schéma Prisma.
ALTER TABLE "Athlete" ADD CONSTRAINT "Athlete_prestige_check"
  CHECK ("prestigeScore" BETWEEN 0 AND 100 AND ("prestigeOverride" IS NULL OR "prestigeOverride" BETWEEN 0 AND 100));
ALTER TABLE "CardEdition" ADD CONSTRAINT "CardEdition_supply_check"
  CHECK ("mintedSupply" >= 0 AND ("maxSupply" IS NULL OR ("maxSupply" > 0 AND "mintedSupply" <= "maxSupply")));
ALTER TABLE "CardEdition" ADD CONSTRAINT "CardEdition_baseValue_check" CHECK ("baseValue" >= 0);
ALTER TABLE "CardInstance" ADD CONSTRAINT "CardInstance_serialNumber_check" CHECK ("serialNumber" IS NULL OR "serialNumber" > 0);
ALTER TABLE "CardInstance" ADD CONSTRAINT "CardInstance_retired_owner_check" CHECK ("retiredAt" IS NULL OR "ownerId" IS NULL);
ALTER TABLE "GameConfiguration" ADD CONSTRAINT "GameConfiguration_values_check"
  CHECK ("id" = 'default' AND "passiveIntervalSeconds" > 0 AND "passiveMaxStock" BETWEEN 1 AND 10 AND "startingBalance" >= 0 AND "bankResaleBasisPoints" BETWEEN 0 AND 10000);
ALTER TABLE "PassiveBoosterState" ADD CONSTRAINT "PassiveBoosterState_values_check"
  CHECK ("stock" BETWEEN 0 AND 10 AND "generatedTotal" >= 0 AND ("stock" < 10 OR "nextGenerationAt" IS NULL));
ALTER TABLE "BoosterType" ADD CONSTRAINT "BoosterType_values_check"
  CHECK ("cardCount" > 0 AND "price" >= 0 AND ("startsAt" IS NULL OR "endsAt" IS NULL OR "endsAt" > "startsAt"));
ALTER TABLE "BoosterRarityWeight" ADD CONSTRAINT "BoosterRarityWeight_probability_check" CHECK ("weightBasisPoints" BETWEEN 0 AND 10000);
ALTER TABLE "BoosterInventory" ADD CONSTRAINT "BoosterInventory_quantity_check" CHECK ("quantity" >= 0);
ALTER TABLE "Wallet" ADD CONSTRAINT "Wallet_nonnegative_check" CHECK ("balance" >= 0 AND "lifetimeEarnings" >= 0 AND "lifetimeSpending" >= 0);
ALTER TABLE "WalletTransaction" ADD CONSTRAINT "WalletTransaction_balance_check" CHECK ("balanceAfter" >= 0);
ALTER TABLE "MarketplaceListing" ADD CONSTRAINT "MarketplaceListing_price_check" CHECK ("price" > 0);
ALTER TABLE "MarketplaceListing" ADD CONSTRAINT "MarketplaceListing_not_self_purchase_check" CHECK ("buyerId" IS NULL OR "buyerId" <> "sellerId");
ALTER TABLE "MarketplaceListing" ADD CONSTRAINT "MarketplaceListing_lifecycle_check"
  CHECK (("status" = 'ACTIVE' AND "buyerId" IS NULL AND "closedAt" IS NULL)
    OR ("status" = 'CANCELLED' AND "buyerId" IS NULL AND "closedAt" IS NOT NULL)
    OR ("status" = 'SOLD' AND "buyerId" IS NOT NULL AND "closedAt" IS NOT NULL));
CREATE UNIQUE INDEX "MarketplaceListing_one_active_per_card" ON "MarketplaceListing" ("cardInstanceId") WHERE "status" = 'ACTIVE';
ALTER TABLE "ImportJob" ADD CONSTRAINT "ImportJob_processedCount_check" CHECK ("processedCount" >= 0);
