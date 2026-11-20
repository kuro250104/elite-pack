-- Widens the licences accepted for an approved image: CC BY and CC BY-SA 2.0, 2.5 and 3.0 (international versions),
-- in addition to CC0 1.0, CC BY 4.0 and CC BY-SA 4.0. Additive: every row valid before stays valid.
ALTER TABLE "AthleteImage" DROP CONSTRAINT "AthleteImage_approval_review_check";
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
      OR ("license" = 'CC-BY-2.0' AND "licenseUrl" = 'https://creativecommons.org/licenses/by/2.0/')
      OR ("license" = 'CC-BY-2.5' AND "licenseUrl" = 'https://creativecommons.org/licenses/by/2.5/')
      OR ("license" = 'CC-BY-3.0' AND "licenseUrl" = 'https://creativecommons.org/licenses/by/3.0/')
      OR ("license" = 'CC-BY-4.0' AND "licenseUrl" = 'https://creativecommons.org/licenses/by/4.0/')
      OR ("license" = 'CC-BY-SA-2.0' AND "licenseUrl" = 'https://creativecommons.org/licenses/by-sa/2.0/')
      OR ("license" = 'CC-BY-SA-2.5' AND "licenseUrl" = 'https://creativecommons.org/licenses/by-sa/2.5/')
      OR ("license" = 'CC-BY-SA-3.0' AND "licenseUrl" = 'https://creativecommons.org/licenses/by-sa/3.0/')
      OR ("license" = 'CC-BY-SA-4.0' AND "licenseUrl" = 'https://creativecommons.org/licenses/by-sa/4.0/'))
    AND ("url" ~ '^https://upload\.wikimedia\.org/wikipedia/commons/[^?#[:space:]]+$'
      OR "url" ~ '^https://www\.thesportsdb\.com/images/media/[^?#[:space:]]+$')
  )
);
