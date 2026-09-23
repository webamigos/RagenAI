/**
 * The vocabularies Brain shares with the schema.
 *
 * Spelled exactly as `prisma/schema.prisma` spells them, not lowercased for a
 * friendlier frontmatter: a bundle is read back by code as well as by people,
 * and a mapping layer between `process` and `PROCESS` is one more place for a
 * value to exist on one side only. This package cannot import the generated
 * enums — every app generates its own client — so
 * `tests/architecture/brain-vocabularies-match-the-schema.test.ts` is what
 * keeps these lists and the schema in step.
 */

export const KNOWLEDGE_PAGE_TYPES = [
  'PROCESS',
  'ENTITY',
  'POLICY',
  'PRODUCT',
  'ROLE',
] as const;
export type KnowledgePageType = (typeof KNOWLEDGE_PAGE_TYPES)[number];

export const KNOWLEDGE_PAGE_STATUSES = [
  'CANDIDATE',
  'APPROVED',
  'REJECTED',
  'STALE',
] as const;
export type KnowledgePageStatus = (typeof KNOWLEDGE_PAGE_STATUSES)[number];

/**
 * The statuses a page may carry in an exported bundle.
 *
 * A candidate is a model's draft and a rejected page is one a person said no
 * to; neither is knowledge anyone vouches for, so neither leaves Postgres.
 * `STALE` does: it is an approved page whose verification lapsed or whose
 * source moved on, and dropping it from the bundle would hide exactly the
 * finding the bundle exists to surface.
 */
export const EXPORTABLE_PAGE_STATUSES = [
  'APPROVED',
  'STALE',
] as const satisfies readonly KnowledgePageStatus[];
export type ExportablePageStatus = (typeof EXPORTABLE_PAGE_STATUSES)[number];

export const KNOWLEDGE_EDGE_ORIGINS = [
  'EXTRACTED',
  'INFERRED',
  'AMBIGUOUS',
] as const;
export type KnowledgeEdgeOrigin = (typeof KNOWLEDGE_EDGE_ORIGINS)[number];

export const KNOWLEDGE_FINDING_TYPES = [
  'CONTRADICTION',
  'GAP',
  'STALE',
  'ORPHAN',
  'UNOWNED',
  'EXTRACTION_FAILED',
] as const;
export type KnowledgeFindingType = (typeof KNOWLEDGE_FINDING_TYPES)[number];

export const KNOWLEDGE_FINDING_STATUSES = [
  'OPEN',
  'RESOLVED',
  'DISMISSED',
] as const;
export type KnowledgeFindingStatus =
  (typeof KNOWLEDGE_FINDING_STATUSES)[number];

export const KNOWLEDGE_DECISION_ACTIONS = [
  'APPROVE',
  'REJECT',
  'MERGE',
  'SET_OWNER',
  'SET_ACCESS',
  'WIDEN_ACCESS',
  'PUBLISH',
  'UNPUBLISH',
  'VERIFY',
] as const;
export type KnowledgeDecisionAction =
  (typeof KNOWLEDGE_DECISION_ACTIONS)[number];

/**
 * The two actions that carry a `publicationGeneration`, and the only two the
 * ledger's `(pageId, action, publicationGeneration)` uniqueness applies to.
 * Every other action records `null` there — see the spec's "Data model".
 */
export const PUBLICATION_ACTIONS = [
  'PUBLISH',
  'UNPUBLISH',
] as const satisfies readonly KnowledgeDecisionAction[];
