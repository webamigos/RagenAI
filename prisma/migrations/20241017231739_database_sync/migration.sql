-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "rate" SMALLINT,
ADD COLUMN     "run_id" TEXT;

-- CreateTable
CREATE TABLE "Settings" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,

    CONSTRAINT "Settings_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "UsersDocuments" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "file_size" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "metadata" JSONB,

    CONSTRAINT "UsersDocuments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UsersDocuments_organization_id_idx" ON "UsersDocuments"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "UsersDocuments_id_organization_id_key" ON "UsersDocuments"("id", "organization_id");
