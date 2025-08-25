-- CreateTable
CREATE TABLE "ThreadDocument" (
    "id" TEXT NOT NULL,
    "thread_id" TEXT NOT NULL,
    "user_file_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ThreadDocument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ThreadDocument_thread_id_user_file_id_key" ON "ThreadDocument"("thread_id", "user_file_id");

-- CreateIndex
CREATE INDEX "ThreadDocument_thread_id_idx" ON "ThreadDocument"("thread_id");

-- CreateIndex
CREATE INDEX "ThreadDocument_user_file_id_idx" ON "ThreadDocument"("user_file_id");

-- AddForeignKey
ALTER TABLE "ThreadDocument" ADD CONSTRAINT "ThreadDocument_thread_id_fkey" FOREIGN KEY ("thread_id") REFERENCES "Thread"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ThreadDocument" ADD CONSTRAINT "ThreadDocument_user_file_id_fkey" FOREIGN KEY ("user_file_id") REFERENCES "UserFile"("public_id") ON DELETE CASCADE ON UPDATE CASCADE;