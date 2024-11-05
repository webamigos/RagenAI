/*
  Warnings:

  - Added the required column `created_by` to the `ApiKey` table without a default value. This is not possible if the table is not empty.
  - Added the required column `name` to the `ApiKey` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "ApiKey" ADD COLUMN     "created_by" TEXT NOT NULL,
ADD COLUMN     "name" TEXT NOT NULL;
