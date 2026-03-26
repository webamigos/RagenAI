-- CreateTable
CREATE TABLE "thread_shares" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "thread_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "shared_by_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "thread_shares_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "thread_shares_user_id_idx" ON "thread_shares"("user_id");

-- CreateIndex
CREATE INDEX "thread_shares_thread_id_idx" ON "thread_shares"("thread_id");

-- CreateIndex
CREATE UNIQUE INDEX "thread_shares_thread_id_user_id_key" ON "thread_shares"("thread_id", "user_id");

-- AddForeignKey
ALTER TABLE "thread_shares" ADD CONSTRAINT "thread_shares_thread_id_fkey" FOREIGN KEY ("thread_id") REFERENCES "threads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "thread_shares" ADD CONSTRAINT "thread_shares_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "thread_shares" ADD CONSTRAINT "thread_shares_shared_by_user_id_fkey" FOREIGN KEY ("shared_by_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
