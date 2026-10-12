-- Les comptes OAuth et sessions existants sont conservés sans modification.
ALTER TABLE "User" ADD COLUMN "passwordHash" TEXT;
