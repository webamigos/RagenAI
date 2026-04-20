-- CreateTable
CREATE TABLE "thread_public_links" (
    "id" SERIAL NOT NULL,
    "public_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "thread_id" UUID NOT NULL,
    "created_by_user_id" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ,
    "password_hash" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "thread_public_links_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "thread_public_links_public_id_key" ON "thread_public_links"("public_id");

-- CreateIndex
CREATE UNIQUE INDEX "thread_public_links_thread_id_key" ON "thread_public_links"("thread_id");

-- AddForeignKey
ALTER TABLE "thread_public_links" ADD CONSTRAINT "thread_public_links_thread_id_fkey" FOREIGN KEY ("thread_id") REFERENCES "threads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "thread_public_links" ADD CONSTRAINT "thread_public_links_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
