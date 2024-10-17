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
CREATE TABLE "documents" (
    "id" BIGSERIAL NOT NULL,
    "content" TEXT,
    "metadata" JSONB,
    "embedding" vector,

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usersDocuments" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "file_size" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "metadata" JSONB,

    CONSTRAINT "usersDocuments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "usersDocuments_organization_id_idx" ON "usersDocuments"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "usersDocuments_id_organization_id_key" ON "usersDocuments"("id", "organization_id");
