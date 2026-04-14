-- Phase 2b: add TOOL_CALL_CONFIRMED to SecurityEventType enum so we can
-- audit user-approved tool calls distinctly from TOOL_CALL_BLOCKED
-- (initial pause) and TOOL_CALL_DENIED (explicit rejection).
ALTER TYPE "SecurityEventType" ADD VALUE IF NOT EXISTS 'TOOL_CALL_CONFIRMED' BEFORE 'TOOL_CALL_DENIED';
