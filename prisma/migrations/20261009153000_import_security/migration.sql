-- AlterTable
ALTER TABLE "ImportJob" ADD COLUMN     "actorId" TEXT,
ADD COLUMN     "idempotencyKey" TEXT,
ADD COLUMN     "result" JSONB;

-- CreateTable
CREATE TABLE "RateLimitBucket" (
    "key" TEXT NOT NULL,
    "windowStart" TIMESTAMPTZ(3) NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "nextAllowedAt" TIMESTAMPTZ(3),

    CONSTRAINT "RateLimitBucket_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "ImportJob_createdAt_idx" ON "ImportJob"("createdAt");

-- CreateIndex
CREATE INDEX "ImportJob_status_createdAt_idx" ON "ImportJob"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ImportJob_actorId_idempotencyKey_key" ON "ImportJob"("actorId", "idempotencyKey");

-- AddForeignKey
ALTER TABLE "ImportJob" ADD CONSTRAINT "ImportJob_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "RateLimitBucket" ADD CONSTRAINT "RateLimitBucket_count_check" CHECK ("count" >= 0);
