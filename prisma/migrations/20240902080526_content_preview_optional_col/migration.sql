-- AlterTable
ALTER TABLE "Message" ADD COLUMN "content_preview" TEXT;

-- Update the new column with the first 30 characters of the "content" column
UPDATE "Message"
SET "content_preview" = SUBSTRING("content" FROM 1 FOR 30) 
WHERE "content" IS NOT NULL;
