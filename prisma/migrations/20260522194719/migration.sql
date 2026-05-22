-- DropForeignKey
ALTER TABLE "credit_ledger_entries" DROP CONSTRAINT "credit_ledger_entries_organization_id_fkey";

-- DropForeignKey
ALTER TABLE "credit_ledger_entries" DROP CONSTRAINT "credit_ledger_entries_user_id_fkey";

-- DropForeignKey
ALTER TABLE "org_credit_balances" DROP CONSTRAINT "org_credit_balances_organization_id_fkey";

-- DropIndex
DROP INDEX "credit_ledger_entries_organization_id_created_at_idx";

-- AlterTable
ALTER TABLE "credit_ledger_entries" ALTER COLUMN "public_id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "org_credit_balances" ALTER COLUMN "updated_at" DROP DEFAULT;

-- CreateIndex
CREATE INDEX "credit_ledger_entries_organization_id_created_at_idx" ON "credit_ledger_entries"("organization_id", "created_at");

-- AddForeignKey
ALTER TABLE "org_credit_balances" ADD CONSTRAINT "org_credit_balances_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_ledger_entries" ADD CONSTRAINT "credit_ledger_entries_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_ledger_entries" ADD CONSTRAINT "credit_ledger_entries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
