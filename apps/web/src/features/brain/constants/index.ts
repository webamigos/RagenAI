/**
 * Rows in one batch of a Brain list. A longer list is paged (`?page=`), and
 * the status filters narrow it first.
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
