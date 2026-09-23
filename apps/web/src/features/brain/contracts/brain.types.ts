/**
 * What the Brain panel (spec D1) reads. Plain data: these cross from server
 * components into client ones, so dates are ISO strings and nothing is a
 * Prisma type.
 */

export type KnowledgePageStatus =
  'CANDIDATE' | 'APPROVED' | 'REJECTED' | 'STALE';
export type KnowledgePageType =
  'PROCESS' | 'ENTITY' | 'POLICY' | 'PRODUCT' | 'ROLE';
export type KnowledgeEdgeOrigin = 'EXTRACTED' | 'INFERRED' | 'AMBIGUOUS';
export type KnowledgeFindingType =
  | 'CONTRADICTION'
  | 'GAP'
  | 'STALE'
  | 'ORPHAN'
  | 'UNOWNED'
  | 'EXTRACTION_FAILED';
export type KnowledgeFindingStatus = 'OPEN' | 'RESOLVED' | 'DISMISSED';
export type KnowledgeFindingSeverity = 'LOW' | 'MEDIUM' | 'HIGH';

export type PageRef = { publicId: string; title: string };

export type KnowledgePageListItem = PageRef & {
  type: KnowledgePageType;
  status: KnowledgePageStatus;
  ownerName: string | null;
  /** Distinct documents the page cites. */
  documents: number;
  openFindings: number;
  published: boolean;
  updatedAt: string;
};

export type KnowledgePageList = {
  items: KnowledgePageListItem[];
  /** Every page matching the filter, of which `items` is the first page. */
  total: number;
};

/**
 * Who a page's `accessibleBy` lets read it, one entry per principal, named.
 * Shown exactly — `docs/panel-ux-rules.md` rule 22: never a label wider or
 * narrower than what the backend enforces.
 */
export type AccessEntry =
  | { kind: 'organization' }
  | { kind: 'user'; name: string | null; id: string }
  | { kind: 'team'; name: string | null; id: string }
  /** A principal that matches nobody in this organization. */
  | { kind: 'unmatched'; principal: string };

/**
 * `current` — the pinned version is the document's active one.
 * `newer-version` — the document has moved on since the curator read it; the
 *   citation still shows the words that were checked.
 * `deleted` — the file is gone (`sourceDeletedAt`, or no row at all).
 */
export type SourceState = 'current' | 'newer-version' | 'deleted';

export type KnowledgePageSourceView = {
  id: number;
  span: string;
  quote: string;
  state: SourceState;
  fileName: string | null;
  /** `UserDocument.id`, for the link to the document; null when gone. */
  documentId: string | null;
  pinnedVersion: number | null;
};

export type KnowledgeEdgeView = {
  direction: 'out' | 'in';
  kind: string;
  origin: KnowledgeEdgeOrigin;
  page: PageRef;
};

/** One row of the page's ledger, newest first, as the page view lists it. */
export type KnowledgeDecisionView = {
  action:
    | 'APPROVE'
    | 'REJECT'
    | 'MERGE'
    | 'SET_OWNER'
    | 'SET_ACCESS'
    | 'WIDEN_ACCESS'
    | 'PUBLISH'
    | 'UNPUBLISH'
    | 'VERIFY';
  /** The actor's name, or null when the user no longer exists. */
  actorName: string | null;
  createdAt: string;
};

export type KnowledgePageDetail = PageRef & {
  /** Internal id and slug, for server-side lookups only (the merge picker). */
  id: number;
  slug: string;
  type: KnowledgePageType;
  status: KnowledgePageStatus;
  content: string;
  ownerId: string | null;
  /** The page this one was merged into, or that replaced it. */
  supersededBy: PageRef | null;
  ownerName: string | null;
  /** `accessibleBy` as stored — what the access editor starts from. */
  principals: string[];
  access: AccessEntry[];
  published: boolean;
  lastVerifiedAt: string | null;
  verifyEvery: string | null;
  updatedAt: string;
  sources: KnowledgePageSourceView[];
  edges: KnowledgeEdgeView[];
  findings: KnowledgeFindingListItem[];
  decisions: KnowledgeDecisionView[];
};

/**
 * A finding's `detail`, reduced to what a reader is shown. The JSON is
 * written by the worker in shapes that belong to each type; anything this
 * panel cannot read becomes `unknown` rather than an error page.
 */
export type FindingSummary =
  | {
      kind: 'contradiction';
      pairs: { a: string | null; b: string | null; explanation: string }[];
    }
  | {
      kind: 'stale';
      reasons: (
        | { kind: 'source_deleted'; fileName: string | null }
        | { kind: 'quote_gone'; fileName: string | null }
        | { kind: 'verification_due'; dueAt: string }
      )[];
    }
  | { kind: 'unowned'; ownerLeft: boolean }
  | { kind: 'orphan' }
  | { kind: 'gap' }
  | { kind: 'extraction_failed'; reason: string | null }
  | { kind: 'unknown' };

export type KnowledgeFindingListItem = {
  publicId: string;
  type: KnowledgeFindingType;
  severity: KnowledgeFindingSeverity;
  status: KnowledgeFindingStatus;
  detectedAt: string;
  pages: PageRef[];
  file: { name: string; documentId: string | null } | null;
  summary: FindingSummary;
};

export type KnowledgeFindingList = {
  items: KnowledgeFindingListItem[];
  total: number;
};
