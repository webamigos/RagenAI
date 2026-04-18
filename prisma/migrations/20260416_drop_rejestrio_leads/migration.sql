-- Drop the unused `rejestrio_leads` table. It was a premature attempt
-- at an org-scoped enrichment cache, but never populated in practice
-- (the assistant-stream hook never fired reliably) and made redundant
-- by the MCP-side `search_enriched_leads` tool which queries
-- `company_profiles` + `financial_documents` in the rejestrio MCP DB
-- directly. When a real sales CRM UI arrives, a dedicated model
-- focused on editorial / workflow fields (status, owner, notes,
-- LinkedIn URL, etc.) will replace it — referencing MCP data by
-- `(organization_id, company_krs)` rather than duplicating it.

DROP TABLE IF EXISTS "rejestrio_leads";
