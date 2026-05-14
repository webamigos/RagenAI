-- CreateEnum
CREATE TYPE "notification_type" AS ENUM ('DOCUMENT_SHARED', 'DRIVE_IMPORT_COMPLETED', 'DOCUMENT_EXPIRING', 'THREAD_SHARED_NEW_MESSAGE', 'DOCUMENT_EMBEDDED');

-- CreateTable
CREATE TABLE "notifications" (
    "id" SERIAL NOT NULL,
    "public_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "type" "notification_type" NOT NULL,
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "resource_url" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "notifications_public_id_key" ON "notifications"("public_id");

-- CreateIndex
CREATE INDEX "notifications_user_id_organization_id_is_read_idx" ON "notifications"("user_id", "organization_id", "is_read");

-- CreateIndex
CREATE INDEX "notifications_user_id_organization_id_created_at_idx" ON "notifications"("user_id", "organization_id", "created_at" DESC);

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
