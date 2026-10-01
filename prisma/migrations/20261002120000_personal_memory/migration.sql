-- Personal memory, Phase A2 (spec 2026-09-27-personal-memory-across-threads).
-- Three tables and one enum, and one AiUsageStep value. Additive only: nothing
-- reads or writes these until later phases, behind `personalMemory`, which
-- defaults to false. Rolling back leaves unused tables and values.
--
-- The two FKs to "threads" cascade, so deleting a thread deletes the memories
-- it last wrote and its change history on both deletion paths (the panel's and
-- the public API's) without a code change. There is deliberately no FK to
-- Better Auth's "members"/"users": the member-removal cleanup is A5.

-- CreateEnum
CREATE TYPE "UserMemoryOperation" AS ENUM ('ADD', 'UPDATE', 'DELETE');

-- AlterEnum
ALTER TYPE "AiUsageStep" ADD VALUE 'MEMORY';

-- CreateTable
CREATE TABLE "user_memory_profiles" (
    "id" SERIAL NOT NULL,
    "organization_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "encrypted_dek" TEXT,
    "extraction_enabled" BOOLEAN NOT NULL DEFAULT true,
    "epoch" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

CONSTRAINT "user_memory_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_memories" (
    "id" SERIAL NOT NULL,
    "public_id" UUID NOT NULL,
    "organization_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "profile_id" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "is_encrypted" BOOLEAN NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "source_thread_id" UUID,
    "expires_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

CONSTRAINT "user_memories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_memory_changes" (
    "id" SERIAL NOT NULL,
    "public_id" UUID NOT NULL,
    "organization_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "profile_id" INTEGER NOT NULL,
    "message_id" TEXT NOT NULL,
    "source_thread_id" UUID,
    "memory_public_id" UUID NOT NULL,
    "operation" "UserMemoryOperation" NOT NULL,
    "previous_content" TEXT,
    "new_content" TEXT,
    "is_encrypted" BOOLEAN NOT NULL,
    "result_version" INTEGER,
    "undone_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

CONSTRAINT "user_memory_changes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_memory_profiles_organization_id_user_id_key" ON "user_memory_profiles"("organization_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_memories_public_id_key" ON "user_memories"("public_id");

-- CreateIndex
CREATE INDEX "user_memories_organization_id_user_id_idx" ON "user_memories"("organization_id", "user_id");

-- CreateIndex
CREATE INDEX "user_memories_source_thread_id_idx" ON "user_memories"("source_thread_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_memory_changes_public_id_key" ON "user_memory_changes"("public_id");

-- CreateIndex
CREATE INDEX "user_memory_changes_organization_id_user_id_message_id_idx" ON "user_memory_changes"("organization_id", "user_id", "message_id");

-- CreateIndex
CREATE INDEX "user_memory_changes_source_thread_id_idx" ON "user_memory_changes"("source_thread_id");

-- AddForeignKey
ALTER TABLE "user_memories" ADD CONSTRAINT "user_memories_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "user_memory_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_memories" ADD CONSTRAINT "user_memories_source_thread_id_fkey" FOREIGN KEY ("source_thread_id") REFERENCES "threads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_memory_changes" ADD CONSTRAINT "user_memory_changes_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "user_memory_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_memory_changes" ADD CONSTRAINT "user_memory_changes_source_thread_id_fkey" FOREIGN KEY ("source_thread_id") REFERENCES "threads"("id") ON DELETE CASCADE ON UPDATE CASCADE;
