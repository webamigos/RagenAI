-- CreateEnum
CREATE TYPE "Subscription" AS ENUM ('FREE', 'BASIC', 'TEAM');

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "subscription" "Subscription" NOT NULL DEFAULT 'FREE';
