-- Ragen Brain's background model calls (candidate extraction, contradiction
-- checks). They were recorded as CHAT_COMPLETION, which the monthly message
-- ceiling counts, so a Brain run spent an organization's chat-message limit.
-- The backfill of existing rows is the next migration: Postgres refuses to use
-- an enum value in the transaction that added it.
ALTER TYPE "AiUsageStep" ADD VALUE 'BRAIN';
