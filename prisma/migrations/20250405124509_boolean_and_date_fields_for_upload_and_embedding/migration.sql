-- AlterTable
ALTER TABLE "UserFile" ADD COLUMN     "embedded_at" TIMESTAMPTZ,
ADD COLUMN     "is_embedded" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "is_uploaded" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "uploaded_at" TIMESTAMPTZ;
