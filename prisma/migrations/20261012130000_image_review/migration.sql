-- AlterTable
ALTER TABLE "AthleteImage" ADD COLUMN     "decisionReason" TEXT,
ADD COLUMN     "evidenceUrl" TEXT,
ADD COLUMN     "reviewedAt" TIMESTAMPTZ(3),
ADD COLUMN     "reviewedById" TEXT,
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 0;

-- AddForeignKey
ALTER TABLE "AthleteImage" ADD CONSTRAINT "AthleteImage_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Fail closed: existing unreviewed records remain hidden; no rights are inferred.
ALTER TABLE "AthleteImage" ADD CONSTRAINT "AthleteImage_review_version_check" CHECK ("version" >= 0);
ALTER TABLE "AthleteImage" ADD CONSTRAINT "AthleteImage_approval_review_check" CHECK (
  NOT "approvedForDisplay" OR (
    "reviewedById" IS NOT NULL AND "reviewedAt" IS NOT NULL
    AND "decisionReason" IS NOT NULL AND length(trim("decisionReason")) > 0
    AND length(trim("source")) > 0
    AND "attribution" IS NOT NULL AND length(trim("attribution")) > 0
    AND "evidenceUrl" IS NOT NULL AND "evidenceUrl" ~ '^https://[^/@[:space:]]+/'
    AND "originalUrl" ~ '^https://[^/@[:space:]]+/'
    AND "license" IS NOT NULL AND "licenseUrl" IS NOT NULL
    AND (("license" = 'CC0-1.0' AND "licenseUrl" = 'https://creativecommons.org/publicdomain/zero/1.0/')
      OR ("license" = 'CC-BY-4.0' AND "licenseUrl" = 'https://creativecommons.org/licenses/by/4.0/')
      OR ("license" = 'CC-BY-SA-4.0' AND "licenseUrl" = 'https://creativecommons.org/licenses/by-sa/4.0/'))
    AND ("url" ~ '^https://upload\.wikimedia\.org/wikipedia/commons/[^?#[:space:]]+$'
      OR "url" ~ '^https://www\.thesportsdb\.com/images/media/[^?#[:space:]]+$')
  )
);
