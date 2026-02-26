/*
  Warnings:

  - The `access_token` column on the `projects` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - Changed the type of `public_id` on the `api_keys` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `public_id` on the `flagged_messages` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `public_id` on the `internal_organizations` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `public_id` on the `messages` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `public_id` on the `projects` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `user_file_id` on the `thread_documents` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `public_id` on the `threads` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `public_id` on the `user_documents` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `public_id` on the `user_files` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- DropForeignKey
ALTER TABLE "thread_documents" DROP CONSTRAINT "thread_documents_user_file_id_fkey";

-- AlterTable
ALTER TABLE "api_keys" DROP COLUMN "public_id",
ADD COLUMN     "public_id" UUID NOT NULL;

-- AlterTable
ALTER TABLE "flagged_messages" DROP COLUMN "public_id",
ADD COLUMN     "public_id" UUID NOT NULL;

-- AlterTable
ALTER TABLE "internal_organizations" DROP COLUMN "public_id",
ADD COLUMN     "public_id" UUID NOT NULL;

-- AlterTable
ALTER TABLE "messages" DROP COLUMN "public_id",
ADD COLUMN     "public_id" UUID NOT NULL;

-- AlterTable
ALTER TABLE "projects" DROP COLUMN "public_id",
ADD COLUMN     "public_id" UUID NOT NULL,
DROP COLUMN "access_token",
ADD COLUMN     "access_token" UUID;

-- AlterTable
ALTER TABLE "thread_documents" DROP COLUMN "user_file_id",
ADD COLUMN     "user_file_id" UUID NOT NULL;

-- AlterTable
ALTER TABLE "threads" DROP COLUMN "public_id",
ADD COLUMN     "public_id" UUID NOT NULL;

-- AlterTable
ALTER TABLE "user_documents" DROP COLUMN "public_id",
ADD COLUMN     "public_id" UUID NOT NULL;

-- AlterTable
ALTER TABLE "user_files" DROP COLUMN "public_id",
ADD COLUMN     "public_id" UUID NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "api_keys_public_id_key" ON "api_keys"("public_id");

-- CreateIndex
CREATE INDEX "api_keys_public_id_idx" ON "api_keys"("public_id");

-- CreateIndex
CREATE UNIQUE INDEX "flagged_messages_public_id_key" ON "flagged_messages"("public_id");

-- CreateIndex
CREATE INDEX "flagged_messages_public_id_idx" ON "flagged_messages"("public_id");

-- CreateIndex
CREATE UNIQUE INDEX "internal_organizations_public_id_key" ON "internal_organizations"("public_id");

-- CreateIndex
CREATE INDEX "internal_organizations_public_id_idx" ON "internal_organizations"("public_id");

-- CreateIndex
CREATE UNIQUE INDEX "messages_public_id_key" ON "messages"("public_id");

-- CreateIndex
CREATE INDEX "messages_public_id_idx" ON "messages"("public_id");

-- CreateIndex
CREATE UNIQUE INDEX "projects_public_id_key" ON "projects"("public_id");

-- CreateIndex
CREATE UNIQUE INDEX "projects_access_token_key" ON "projects"("access_token");

-- CreateIndex
CREATE INDEX "projects_public_id_idx" ON "projects"("public_id");

-- CreateIndex
CREATE INDEX "projects_access_token_idx" ON "projects"("access_token");

-- CreateIndex
CREATE INDEX "thread_documents_user_file_id_idx" ON "thread_documents"("user_file_id");

-- CreateIndex
CREATE UNIQUE INDEX "thread_documents_thread_id_user_file_id_key" ON "thread_documents"("thread_id", "user_file_id");

-- CreateIndex
CREATE UNIQUE INDEX "threads_public_id_key" ON "threads"("public_id");

-- CreateIndex
CREATE INDEX "threads_public_id_idx" ON "threads"("public_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_documents_public_id_key" ON "user_documents"("public_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_files_public_id_key" ON "user_files"("public_id");

-- CreateIndex
CREATE INDEX "user_files_public_id_idx" ON "user_files"("public_id");

-- AddForeignKey
ALTER TABLE "thread_documents" ADD CONSTRAINT "thread_documents_user_file_id_fkey" FOREIGN KEY ("user_file_id") REFERENCES "user_files"("public_id") ON DELETE CASCADE ON UPDATE CASCADE;
