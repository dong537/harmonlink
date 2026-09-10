ALTER TABLE "tickets"
  ADD COLUMN "legacyId" SERIAL NOT NULL;

CREATE UNIQUE INDEX "tickets_legacyId_key" ON "tickets"("legacyId");
