-- AlterTable
ALTER TABLE "thread_public_links" ALTER COLUMN "public_id" DROP DEFAULT;

-- CreateIndex
CREATE INDEX "thread_public_links_public_id_idx" ON "thread_public_links"("public_id");
