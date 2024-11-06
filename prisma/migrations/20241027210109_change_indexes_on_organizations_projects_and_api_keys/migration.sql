/*
  Warnings:

  - A unique constraint covering the columns `[public_id]` on the table `Organization` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[provider_id]` on the table `Organization` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "Organization_public_id_provider_id_key";

-- CreateIndex
CREATE UNIQUE INDEX "Organization_public_id_key" ON "Organization"("public_id");

-- CreateIndex
CREATE UNIQUE INDEX "Organization_provider_id_key" ON "Organization"("provider_id");
