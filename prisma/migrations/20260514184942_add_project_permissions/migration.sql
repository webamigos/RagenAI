-- AlterEnum
ALTER TYPE "notification_type" ADD VALUE 'PROJECT_SHARED';

-- CreateTable
CREATE TABLE "project_permissions" (
    "id" SERIAL NOT NULL,
    "project_id" UUID NOT NULL,
    "grantee_type" TEXT NOT NULL,
    "grantee_id" TEXT NOT NULL,
    "permission" TEXT NOT NULL DEFAULT 'view',
    "granted_by" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_permissions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "project_permissions_project_id_idx" ON "project_permissions"("project_id");

-- CreateIndex
CREATE INDEX "project_permissions_grantee_type_grantee_id_idx" ON "project_permissions"("grantee_type", "grantee_id");

-- CreateIndex
CREATE UNIQUE INDEX "project_permissions_project_id_grantee_type_grantee_id_key" ON "project_permissions"("project_id", "grantee_type", "grantee_id");

-- AddForeignKey
ALTER TABLE "project_permissions" ADD CONSTRAINT "project_permissions_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
