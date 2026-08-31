-- Remove the leads feature.
--
-- Leads were extracted into a separate product and are no longer developed
-- here (decision 2026-08-31). Dropping in dependency order: lead_enrichment_jobs
-- and leads both reference lead_lists.
--
-- IRREVERSIBLE: this deletes all lead data. Production held 5 lists / 634 leads
-- at the time this was written; they live in the other project now.

DROP TABLE IF EXISTS "lead_enrichment_jobs";
DROP TABLE IF EXISTS "leads";
DROP TABLE IF EXISTS "lead_lists";

DROP TYPE IF EXISTS "LeadEnrichmentJobStatus";
DROP TYPE IF EXISTS "LeadEnrichmentStatus";
DROP TYPE IF EXISTS "LeadScoringStatus";
