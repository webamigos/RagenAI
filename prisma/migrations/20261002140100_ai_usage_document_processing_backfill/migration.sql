-- Move the document-processing rows already written as CHAT_COMPLETION to
-- DOCUMENT_PROCESSING, so the current month's message count stops including
-- them and the AI-usage page files past spend under its own step.
--
-- The marker is reliable: each call site has written its `metadata.kind`
-- since it has been in this repository (summaries and scoring since the
-- worker moved in, #807; Optimize since #825), and no chat path writes any of
-- the three values.
UPDATE "ai_usage"
SET "step" = 'DOCUMENT_PROCESSING'
WHERE "step" = 'CHAT_COMPLETION'
  AND "metadata"->>'kind' IN ('document_summary', 'rag_scorer', 'rag_optimizer');
