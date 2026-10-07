/*
 * Moved to `@ragenai/rag-core/retrieval-usage` so `apps/api` records and reads
 * citations by the same rule as the panel (spec
 * 2026-10-07-api-answers-carry-their-sources, A1). Kept here so the many
 * importers, and the tests beside this file, stay where they were.
 */
export {
  extractMarkerNumbers,
  findMarkerRuns,
  parseCitationMarkers,
  type CitationMarkers,
  type Marker,
  type MarkerRun,
} from '@ragenai/rag-core/retrieval-usage';
