-- A thread remembers how much it may retrieve.
--
-- The enum values are also the wire values and the generated TypeScript ones.
-- Prisma's `@map` on an enum member renames only the database side, so the
-- prettier 'knowledge-base' spelling would have bought one readable column at
-- the cost of a third vocabulary to translate. `message_content_type` next
-- door already made this choice.
CREATE TYPE "knowledge_scope" AS ENUM ('KNOWLEDGE_BASE', 'ASSISTANT', 'MODEL_ONLY');

-- Existing threads get the default, which is today's behaviour. Backfill is
-- therefore a no-op by construction rather than by luck — every row already
-- searched the knowledge base.
ALTER TABLE "threads"
  ADD COLUMN "knowledge_scope" "knowledge_scope" NOT NULL DEFAULT 'KNOWLEDGE_BASE';
