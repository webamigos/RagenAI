-- AlterTable
ALTER TABLE "organization" ADD COLUMN     "hasKnowledge" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "ragenOrgId" TEXT,
ADD COLUMN     "vectorStore" TEXT;

-- AlterTable
ALTER TABLE "user" ADD COLUMN     "viewMode" TEXT NOT NULL DEFAULT 'list';
