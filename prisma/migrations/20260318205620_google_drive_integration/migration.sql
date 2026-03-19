-- CreateTable
CREATE TABLE "google_drive_syncs" (
    "id" UUID NOT NULL,
    "organization_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "project_id" INTEGER NOT NULL,
    "drive_folder_id" TEXT NOT NULL,
    "folder_name" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "last_synced_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "google_drive_syncs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "google_drive_syncs_organization_id_idx" ON "google_drive_syncs"("organization_id");

-- CreateIndex
CREATE INDEX "google_drive_syncs_enabled_idx" ON "google_drive_syncs"("enabled");

-- CreateIndex
CREATE UNIQUE INDEX "google_drive_syncs_organization_id_project_id_drive_folder__key" ON "google_drive_syncs"("organization_id", "project_id", "drive_folder_id");

-- AddForeignKey
ALTER TABLE "google_drive_syncs" ADD CONSTRAINT "google_drive_syncs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "google_drive_syncs" ADD CONSTRAINT "google_drive_syncs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "google_drive_syncs" ADD CONSTRAINT "google_drive_syncs_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
