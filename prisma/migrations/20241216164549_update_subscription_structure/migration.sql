/*
  Warnings:

  - You are about to drop the column `subscription_id` on the `Organization` table. All the data in the column will be lost.
  - You are about to drop the column `stripe_plan` on the `Subscription` table. All the data in the column will be lost.
  - You are about to drop the column `subscription_plan` on the `Subscription` table. All the data in the column will be lost.
  - You are about to drop the column `subscription_status` on the `Subscription` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[organization_id]` on the table `Subscription` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `current_period_end` to the `Subscription` table without a default value. This is not possible if the table is not empty.
  - Added the required column `current_period_start` to the `Subscription` table without a default value. This is not possible if the table is not empty.
  - Added the required column `organization_id` to the `Subscription` table without a default value. This is not possible if the table is not empty.
  - Added the required column `plan_id` to the `Subscription` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updated_at` to the `Subscription` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "PlanType" AS ENUM ('INTERNAL', 'STRIPE');

-- CreateEnum
CREATE TYPE "PlanStatus" AS ENUM ('ACTIVE', 'ARCHIVED', 'DELETED');

-- DropForeignKey
ALTER TABLE "Organization" DROP CONSTRAINT "Organization_subscription_id_fkey";

-- AlterTable
ALTER TABLE "Organization" DROP COLUMN "subscription_id";

-- AlterTable
ALTER TABLE "Subscription" DROP COLUMN "stripe_plan",
DROP COLUMN "subscription_plan",
DROP COLUMN "subscription_status",
ADD COLUMN     "canceled_at" TIMESTAMPTZ,
ADD COLUMN     "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "current_period_end" TIMESTAMPTZ NOT NULL,
ADD COLUMN     "current_period_start" TIMESTAMPTZ NOT NULL,
ADD COLUMN     "organization_id" INTEGER NOT NULL,
ADD COLUMN     "plan_id" INTEGER NOT NULL,
ADD COLUMN     "status" "SubscriptionStatus" NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN     "trial_end" TIMESTAMPTZ,
ADD COLUMN     "updated_at" TIMESTAMPTZ NOT NULL,
ALTER COLUMN "stripe_customer_id" DROP NOT NULL,
ALTER COLUMN "stripe_subscription_id" DROP NOT NULL;

-- CreateTable
CREATE TABLE "Plan" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "type" "PlanType" NOT NULL DEFAULT 'INTERNAL',
    "stripe_price_id" TEXT,
    "stripe_product_id" TEXT,
    "stripe_metadata" JSONB,
    "status" "PlanStatus" NOT NULL DEFAULT 'ACTIVE',
    "features" JSONB NOT NULL,
    "last_synced_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "Plan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UsagePeriod" (
    "id" SERIAL NOT NULL,
    "subscription_id" INTEGER NOT NULL,
    "start_date" TIMESTAMPTZ NOT NULL,
    "end_date" TIMESTAMPTZ NOT NULL,
    "metrics" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "UsagePeriod_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Plan_stripe_price_id_key" ON "Plan"("stripe_price_id");

-- CreateIndex
CREATE UNIQUE INDEX "Plan_stripe_product_id_key" ON "Plan"("stripe_product_id");

-- CreateIndex
CREATE INDEX "Plan_stripe_price_id_idx" ON "Plan"("stripe_price_id");

-- CreateIndex
CREATE INDEX "Plan_status_idx" ON "Plan"("status");

-- CreateIndex
CREATE INDEX "UsagePeriod_subscription_id_end_date_idx" ON "UsagePeriod"("subscription_id", "end_date");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_organization_id_key" ON "Subscription"("organization_id");

-- CreateIndex
CREATE INDEX "Subscription_status_idx" ON "Subscription"("status");

-- CreateIndex
CREATE INDEX "Subscription_current_period_end_idx" ON "Subscription"("current_period_end");

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "Plan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UsagePeriod" ADD CONSTRAINT "UsagePeriod_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "Subscription"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
