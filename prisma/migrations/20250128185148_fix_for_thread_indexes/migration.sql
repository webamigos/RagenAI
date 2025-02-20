-- DropIndex
DROP INDEX "Thread_organization_id_user_id_key";

-- CreateIndex
CREATE INDEX "Thread_public_id_idx" ON "Thread"("public_id");

-- CreateIndex
CREATE INDEX "Thread_organization_id_idx" ON "Thread"("organization_id");

-- CreateIndex
CREATE INDEX "Thread_user_id_idx" ON "Thread"("user_id");
