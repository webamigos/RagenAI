/**
 * Rows a Brain list shows before saying how many there are in all. A
 * curation queue longer than this is filtered, not scrolled; D2 adds the
 * filters that make that practical.
 */
export const BRAIN_LIST_LIMIT = 200;

export const PAGE_STATUS_FILTERS = [
  'CANDIDATE',
  'APPROVED',
  'STALE',
  'REJECTED',
] as const;

export const FINDING_STATUS_FILTERS = [
  'OPEN',
  'RESOLVED',
  'DISMISSED',
] as const;
