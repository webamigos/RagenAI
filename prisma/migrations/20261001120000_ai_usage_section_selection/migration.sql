-- The model call that chooses which retrieved sections a turn reads
-- (spec 2026-09-29-llm-document-selection, C2). Nothing writes it until
-- Phase D wires selection in behind `sectionSelection`, so every generated
-- client knows the member before any writer produces it.
ALTER TYPE "AiUsageStep" ADD VALUE 'SECTION_SELECTION';
