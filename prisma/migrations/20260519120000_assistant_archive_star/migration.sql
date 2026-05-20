-- AlterTable
ALTER TABLE "projects"
  ADD COLUMN "is_starred" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "is_archived" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "archived_at" TIMESTAMPTZ;

-- CreateIndex
CREATE INDEX "projects_is_archived_idx" ON "projects"("is_archived");

-- AlterTable
ALTER TABLE "project_settings"
  ADD COLUMN "integrations_prompted_at" TIMESTAMPTZ;
