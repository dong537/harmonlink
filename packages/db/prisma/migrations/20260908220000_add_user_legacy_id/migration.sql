-- Frozen admin routes require a stable numeric user identifier. Keep this
-- independent from Zone storage so API identity can deploy first.
ALTER TABLE "users"
  ADD COLUMN "legacyId" SERIAL NOT NULL;

CREATE UNIQUE INDEX "users_legacyId_key" ON "users"("legacyId");
