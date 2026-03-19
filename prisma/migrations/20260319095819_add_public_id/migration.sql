/*
  Warnings:

  - A unique constraint covering the columns `[public_id]` on the table `google_drive_syncs` will be added. If there are existing duplicate values, this will fail.
  - The required column `public_id` was added to the `google_drive_syncs` table with a prisma-level default value. This is not possible if the table is not empty. Please add this column as optional, then populate it before making it required.

*/
-- AlterTable
ALTER TABLE "google_drive_syncs" ADD COLUMN     "public_id" UUID NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "google_drive_syncs_public_id_key" ON "google_drive_syncs"("public_id");

-- CreateIndex
CREATE INDEX "google_drive_syncs_user_id_idx" ON "google_drive_syncs"("user_id");

-- CreateIndex
CREATE INDEX "google_drive_syncs_project_id_idx" ON "google_drive_syncs"("project_id");
