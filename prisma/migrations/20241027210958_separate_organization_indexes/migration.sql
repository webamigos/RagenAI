-- DropIndex
DROP INDEX "Organization_public_id_provider_id_idx";

-- CreateIndex
CREATE INDEX "Organization_public_id_idx" ON "Organization"("public_id");

-- CreateIndex
CREATE INDEX "Organization_provider_id_idx" ON "Organization"("provider_id");
