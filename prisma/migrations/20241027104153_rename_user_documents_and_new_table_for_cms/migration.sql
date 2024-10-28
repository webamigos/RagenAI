/*
  Warnings:

  - You are about to drop the `UsersDocuments` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropTable
DROP TABLE "UsersDocuments";

-- CreateTable
CREATE TABLE "UserFiles" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "file_size" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "metadata" JSONB,

    CONSTRAINT "UserFiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserDocuments" (
    "id" BIGSERIAL NOT NULL,
    "public_id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),

    CONSTRAINT "UserDocuments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UserFiles_organization_id_idx" ON "UserFiles"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "UserFiles_id_organization_id_key" ON "UserFiles"("id", "organization_id");
