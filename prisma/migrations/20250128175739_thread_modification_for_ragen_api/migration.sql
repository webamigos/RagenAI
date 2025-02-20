/*
  Warnings:

  - A unique constraint covering the columns `[organization_id,user_id]` on the table `Thread` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "Source" AS ENUM ('UI', 'API');

-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "source" "Source" NOT NULL DEFAULT 'UI';

-- AlterTable
ALTER TABLE "Thread" ADD COLUMN     "organization_id" TEXT,
ADD COLUMN     "source" "Source" NOT NULL DEFAULT 'UI',
ADD COLUMN     "user_id" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Thread_organization_id_user_id_key" ON "Thread"("organization_id", "user_id");
