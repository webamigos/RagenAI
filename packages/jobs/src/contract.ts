/**
 * What a background job is called, what it is handed, and what it hands back.
 *
 * This file is the reason the package exists. The same six job names were
 * declared twice before it — as a `Workflow` enum in
 * `apps/web/src/features/documents/contracts/document.types.ts` and as a
 * hand-maintained subset in `apps/api/src/temporal/temporal.consts.ts`, whose
 * own comment said "keep in sync by hand". That is the duplication
 * [ADR-33](../../../docs/adrs/33-shared-platform-contracts-package.md) exists
 * to stop; it lands here rather than in `platform-contracts` because it is
 * runtime plumbing, not a per-organization capability.
 *
 * The payloads moved from `apps/worker`, which is where they were already
 * defined and documented as payloads rather than as row mirrors. Nothing about
 * their shape changes here: a payload's shape is in the history of every
 * unfinished run, so relocating it is the only safe operation.
 */

/**
 * The four schema enums a payload carries, as unions rather than as imports.
 *
 * A shared package cannot import an app's generated Prisma client — each app
 * generates its own — so these are declared, and
 * `tests/architecture/job-payload-enums-match-the-schema.test.ts` reads
 * `prisma/schema.prisma` and fails when the two disagree. That is the same
 * trade the worker's own payload type made for the Temporal sandbox, with the
 * drift check the hand-written version did not have.
 */
export type FileType =
  | 'UNKNOWN'
  | 'TEXT'
  | 'MARKDOWN'
  | 'EPUB'
  | 'PDF'
  | 'SRT'
  | 'URL'
  | 'IMAGE'
  | 'CSV'
  | 'XLSX'
  | 'DOCX'
  | 'PPTX';

export type ParsingStatus =
  'NOT_STARTED' | 'STARTED' | 'COMPLETED' | 'FAILED' | 'CANCELLED';

export type EmbeddingStatus =
  | 'NOT_STARTED'
  | 'STARTED'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED'
  | 'STAGED'
  | 'WITHDRAWN';

export type PiiPolicy = 'NONE' | 'TOXIC_ONLY' | 'STRICT';

/** How a website is fetched. Mirrors `WebsiteLoaderMode` in both apps. */
export type WebsiteLoaderMode = 'crawl' | 'scrape';

/**
 * Every job this deployment can run, by the name it has always had.
 *
 * The strings are unchanged on purpose: they are what a producer wrote into
 * `UserFile.workflowId`, what an in-flight engine record is keyed by, and what
 * the repo's "reference by string name, not function import" convention has
 * always meant. Renaming one is a migration, not a refactor.
 */
export const JOB_NAMES = [
  'runFileEmbeddings',
  'scrapeWebsite',
  'generateDocument',
  'reindexDocumentVersion',
  'optimizeDocument',
  'scoreDocument',
  'cleanupDemoThreads',
  'pruneAnalyticsRetrievals',
  'brainExtract',
  'brainReconcileFindings',
] as const;

export type JobName = (typeof JOB_NAMES)[number];

/**
 * The `runFileEmbeddings` payload — *not* a mirror of the `user_files` row,
 * which is what it looks like at first glance.
 *
 * A producer starts the job with this, so it carries context the row does not
 * have (`organizationSlug`, `userEmail`, `requestId`, `piiPolicy`) and its
 * timestamps are strings, because a payload is JSON on the wire.
 */
/**
 * The ingest payload: which file, in which organization.
 *
 * It used to be the `user_files` row — twenty-odd fields, nine of them dates
 * the payload typed as strings — plus context the row did not have. Every
 * producer built it through `toRunFileEmbeddingsPayload`, which existed
 * because nine call sites had each converted a different subset by hand.
 *
 * All of it is read from the row now, and the row is the better source: every
 * producer already writes what it knows *before* it enqueues, so a payload
 * copy could only be equal or stale. The Drive sync made that plainest — it
 * wrote `fileName`, `fileSize` and `metadata` to the row and then repeated the
 * same three values into the payload, because the object it held in memory was
 * the stale one.
 *
 * `requestId` is gone too: it was the run id echoed back for log correlation,
 * and a handler has `ctx.runId`.
 */
export interface RunFileEmbeddingsPayload {
  fileId: string;
  orgId: string;
}

export interface ScrapeWebsitePayload {
  url: string;
  mode: WebsiteLoaderMode;
  orgId: string;
  projectId: string | null;
  orgSlug?: string;
  userEmail?: string;
  userId?: string;
}

export interface GenerateDocumentPayload {
  templateName: string;
  rawInput: Record<string, unknown>;
  clientName: string;
  driveFolderId: string;
  driveAccessToken: string;
  orgId: string;
  userId: string;
  userEmail: string;
}

export interface GenerateDocumentResult {
  fileId: string;
  fileUrl: string;
  fileName: string;
}

export interface ReindexDocumentVersionPayload {
  orgId: string;
  fileId: string;
  fileName: string;
  projectId: string | null;
  userId: string | null;
  /**
   * The document whose current text to embed.
   *
   * An identifier, where this used to be the text itself. A payload is a copy:
   * on Temporal it sat in workflow history, and on BullMQ it sits in Redis —
   * unencrypted, and outside the retention anyone reasons about. It is also
   * the staler of the two: every producer persists the document *before*
   * enqueueing, so re-reading embeds what the document says now rather than
   * what it said when the job was queued, which is what two rollbacks in quick
   * succession used to get wrong.
   */
  documentId: string;
}

export interface OptimizeDocumentPayload {
  jobId: string;
  documentId: string;
  orgId: string;
  projectId?: string | null;
  userId?: string | null;
  /**
   * The active version's RAG score, carried so the job row shows it while the
   * run is still `processing`.
   *
   * Absent from every type this payload has ever had, and sent by the route
   * and read by `optimizeDocumentSuggestions` regardless — an untyped
   * `args: [...]` is what let the two agree behind the type's back. Typing the
   * producer side is what surfaced it; dropping the field instead would blank
   * a score the UI already shows.
   */
  baseScore?: number | null;
}

export interface ScoreDocumentPayload {
  fileId: string;
  documentId?: string | null;
  orgId: string;
  projectId?: string | null;
  userId?: string | null;
  fileName?: string;
  documentText: string;
}

export interface CleanupDemoThreadsResult {
  skipped: boolean;
  threadsDeleted: number;
  messagesDeleted: number;
  /** Whether the organization's restrictions were re-applied this run. */
  restrictionsRestored: boolean;
}

export interface PruneAnalyticsRetrievalsResult {
  organizationsScanned: number;
  retrievalsDeleted: number;
  olderThan: string;
}

/**
 * Ragen Brain's extraction run: candidate pages from one or more documents
 * (docs/specs/2026-09-18-ragen-brain-knowledge-curation.md, B3).
 *
 * Identifiers only, for the reason `ReindexDocumentVersionPayload` gives: the
 * handler reads each document's active version when it runs, so the payload
 * never holds document text in Redis. One file is the retry of an
 * `EXTRACTION_FAILED` finding (D3); many is a run over a selection, and the
 * run's budget applies to the whole of it.
 */
export interface BrainExtractPayload {
  orgId: string;
  fileIds: string[];
  /** Who started the run, for the AI-usage row. Null for a system start. */
  userId?: string | null;
}

/**
 * Re-run Brain's computed findings (GAP, ORPHAN, STALE, UNOWNED) for one
 * organization, outside an extraction run (spec D2b). Started after a review
 * decision — a new owner, an approval — changes what those findings say, so
 * the inbox does not keep showing a problem someone just fixed until the next
 * extraction. The findings are a view the worker owns; the panel starts this
 * rather than writing them itself.
 */
export interface BrainReconcileFindingsPayload {
  orgId: string;
}

export interface BrainReconcileFindingsResult {
  /** `disabled` when the organization's `brain` flag is off at run time. */
  skipped: 'disabled' | null;
  created: number;
  updated: number;
  resolved: number;
}

export interface BrainExtractResult {
  /** `disabled` when the organization's `brain` flag is off at run time. */
  skipped: 'disabled' | null;
  extracted: number;
  failed: number;
  /** Documents never attempted because the run's budget ran out. */
  notAttempted: number;
  pagesCreated: number;
  unverifiedClaims: number;
  tokens: number;
  /**
   * The contradiction check over the pages this run wrote (spec C1); null
   * when it did not run — nothing extracted, no tokens left — or failed.
   * Its tokens are in `tokens`.
   */
  contradictions: {
    pairs: number;
    raised: number;
    cleared: number;
    failed: number;
    notJudged: number;
  } | null;
  /**
   * What reconciling the computed findings wrote at the end of the run
   * (spec C2); null when it failed, which does not fail the run.
   */
  findings: { created: number; updated: number; resolved: number } | null;
}

/**
 * What each job is handed.
 *
 * The two scheduled jobs take nothing: they are started by a schedule rather
 * than by a producer, and a payload would be a value nobody supplies.
 */
export interface JobPayloads {
  runFileEmbeddings: RunFileEmbeddingsPayload;
  scrapeWebsite: ScrapeWebsitePayload;
  generateDocument: GenerateDocumentPayload;
  reindexDocumentVersion: ReindexDocumentVersionPayload;
  optimizeDocument: OptimizeDocumentPayload;
  scoreDocument: ScoreDocumentPayload;
  cleanupDemoThreads: void;
  pruneAnalyticsRetrievals: void;
  brainExtract: BrainExtractPayload;
  brainReconcileFindings: BrainReconcileFindingsPayload;
}

/**
 * What each job hands back, for the one route that reads a result.
 *
 * Only `generateDocument`'s is consumed by a caller
 * (`/api/documents/status/[workflowId]`). The rest are recorded rather than
 * read, so they are typed for the handler's sake, not a consumer's.
 */
export interface JobResults {
  runFileEmbeddings: string;
  scrapeWebsite: string;
  generateDocument: GenerateDocumentResult;
  reindexDocumentVersion: string;
  optimizeDocument: void;
  scoreDocument: void;
  cleanupDemoThreads: CleanupDemoThreadsResult;
  pruneAnalyticsRetrievals: PruneAnalyticsRetrievalsResult;
  brainExtract: BrainExtractResult;
  brainReconcileFindings: BrainReconcileFindingsResult;
}
