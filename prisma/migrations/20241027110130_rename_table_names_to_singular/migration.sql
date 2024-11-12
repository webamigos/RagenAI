/*
  Warnings:

  - You are about to drop the `UserDocuments` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `UserFiles` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropTable
DROP TABLE "UserDocuments";

-- DropTable
DROP TABLE "UserFiles";

-- CreateTable
CREATE TABLE "UserFile" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "file_size" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "metadata" JSONB,

    CONSTRAINT "UserFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserDocument" (
    "id" BIGSERIAL NOT NULL,
    "public_id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),

    CONSTRAINT "UserDocument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UserFile_organization_id_idx" ON "UserFile"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "UserFile_id_organization_id_key" ON "UserFile"("id", "organization_id");
