-- Move the Brain rows already written as CHAT_COMPLETION to BRAIN, so the
-- current month's message count stops including them and the AI-usage page
-- files past Brain spend under its own step.
--
-- The marker is reliable: both worker call sites have written
-- `metadata.kind` since they were introduced (#1309, #1318), and nothing else
-- writes either value. The Brain assistant's rows (`brain_assistant`) are a
-- user's chat turn and stay CHAT_COMPLETION.
UPDATE "ai_usage"
SET "step" = 'BRAIN'
WHERE "step" = 'CHAT_COMPLETION'
  AND "metadata"->>'kind' IN ('brain_extract', 'brain_contradictions');
