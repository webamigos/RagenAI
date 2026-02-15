/*
  Warnings:

  - The primary key for the `subscriptions` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `canceled_at` on the `subscriptions` table. All the data in the column will be lost.
  - You are about to drop the column `created_at` on the `subscriptions` table. All the data in the column will be lost.
  - You are about to drop the column `current_period_end` on the `subscriptions` table. All the data in the column will be lost.
  - You are about to drop the column `current_period_start` on the `subscriptions` table. All the data in the column will be lost.
  - You are about to drop the column `organization_id` on the `subscriptions` table. All the data in the column will be lost.
  - You are about to drop the column `plan_id` on the `subscriptions` table. All the data in the column will be lost.
  - You are about to drop the column `updated_at` on the `subscriptions` table. All the data in the column will be lost.
  - The `status` column on the `subscriptions` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - You are about to drop the `plans` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `usage_periods` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `plan` to the `subscriptions` table without a default value. This is not possible if the table is not empty.
  - Added the required column `reference_id` to the `subscriptions` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "SubscriptionPlanType" AS ENUM ('INTERNAL', 'STRIPE');

-- CreateEnum
CREATE TYPE "SubscriptionPlanStatus" AS ENUM ('ACTIVE', 'ARCHIVED', 'DELETED');

-- DropForeignKey
ALTER TABLE "subscriptions" DROP CONSTRAINT "subscriptions_organization_id_fkey";

-- DropForeignKey
ALTER TABLE "subscriptions" DROP CONSTRAINT "subscriptions_plan_id_fkey";

-- DropForeignKey
ALTER TABLE "usage_periods" DROP CONSTRAINT "usage_periods_subscription_id_fkey";

-- DropIndex
DROP INDEX "subscriptions_current_period_end_idx";

-- DropIndex
DROP INDEX "subscriptions_organization_id_key";

-- AlterTable
ALTER TABLE "subscriptions" DROP CONSTRAINT "subscriptions_pkey",
DROP COLUMN "canceled_at",
DROP COLUMN "created_at",
DROP COLUMN "current_period_end",
DROP COLUMN "current_period_start",
DROP COLUMN "organization_id",
DROP COLUMN "plan_id",
DROP COLUMN "updated_at",
ADD COLUMN     "cancel_at_period_end" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "period_end" TIMESTAMPTZ,
ADD COLUMN     "period_start" TIMESTAMPTZ,
ADD COLUMN     "plan" TEXT NOT NULL,
ADD COLUMN     "reference_id" TEXT NOT NULL,
ADD COLUMN     "seats" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "trial_start" TIMESTAMPTZ,
ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "id" SET DATA TYPE TEXT,
DROP COLUMN "status",
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'active',
ADD CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id");
DROP SEQUENCE "subscriptions_id_seq";

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "stripe_customer_id" TEXT;

-- DropTable
DROP TABLE "plans";

-- DropTable
DROP TABLE "usage_periods";

-- DropEnum
DROP TYPE "PlanStatus";

-- DropEnum
DROP TYPE "PlanType";

-- DropEnum
DROP TYPE "SubscriptionPlan";

-- DropEnum
DROP TYPE "SubscriptionStatus";

-- CreateTable
CREATE TABLE "subscription_plans" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "price_id" TEXT NOT NULL,
    "type" "SubscriptionPlanType" NOT NULL DEFAULT 'INTERNAL',
    "status" "SubscriptionPlanStatus" NOT NULL DEFAULT 'ACTIVE',
    "features" JSONB,
    "limits" JSONB NOT NULL,
    "last_synced_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "metadata" JSONB,
    "product_id" TEXT,
    "public_id" UUID NOT NULL,

    CONSTRAINT "subscription_plans_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "subscription_plans_product_id_key" ON "subscription_plans"("product_id");

-- CreateIndex
CREATE UNIQUE INDEX "subscription_plans_public_id_key" ON "subscription_plans"("public_id");

-- CreateIndex
CREATE INDEX "subscription_plans_price_id_idx" ON "subscription_plans"("price_id");

-- CreateIndex
CREATE INDEX "subscription_plans_name_idx" ON "subscription_plans"("name");

-- CreateIndex
CREATE INDEX "subscriptions_plan_idx" ON "subscriptions"("plan");

-- CreateIndex
CREATE INDEX "subscriptions_reference_id_idx" ON "subscriptions"("reference_id");

-- CreateIndex
CREATE INDEX "subscriptions_stripe_customer_id_idx" ON "subscriptions"("stripe_customer_id");

-- CreateIndex
CREATE INDEX "subscriptions_stripe_subscription_id_idx" ON "subscriptions"("stripe_subscription_id");

-- CreateIndex
CREATE INDEX "subscriptions_status_idx" ON "subscriptions"("status");
