/*
  Warnings:

  - Made the column `public_id` on table `UserFile` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "UserFile" ALTER COLUMN "public_id" SET NOT NULL;
