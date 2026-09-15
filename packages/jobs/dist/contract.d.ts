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
  'NOT_STARTED' | 'STARTED' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
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
export declare const JOB_NAMES: readonly [
  'runFileEmbeddings',
  'scrapeWebsite',
  'generateDocument',
  'reindexDocumentVersion',
  'optimizeDocument',
  'scoreDocument',
  'cleanupDemoThreads',
  'pruneAnalyticsRetrievals',
];
export type JobName = (typeof JOB_NAMES)[number];
/**
 * The `runFileEmbeddings` payload — *not* a mirror of the `user_files` row,
 * which is what it looks like at first glance.
 *
 * A producer starts the job with this, so it carries context the row does not
 * have (`organizationSlug`, `userEmail`, `requestId`, `piiPolicy`) and its
 * timestamps are strings, because a payload is JSON on the wire.
 */
export interface RunFileEmbeddingsPayload {
  id: string;
  organizationId: string;
  fileName: string;
  fileSize: number;
  fileType: FileType;
  createdAt: string | null;
  updatedAt: string | null;
  metadata: unknown;
  documentId: string | null;
  projectId: string | null;
  isUploaded: boolean;
  uploadedAt: string | null;
  parsingStatus: ParsingStatus;
  parsingStartedAt: string | null;
  parsingCompletedAt: string | null;
  parsingFailedAt: string | null;
  embeddingStatus: EmbeddingStatus;
  embeddingStartedAt: string | null;
  embeddingCompletedAt: string | null;
  embeddingFailedAt: string | null;
  isBinaryFile: boolean;
  fileExtension?: string | null;
  fileMimeType?: string | null;
  thumbnailS3Key?: string | null;
  sourceFileId?: string | null;
  folderId?: string | null;
  pageCount?: number | null;
  /** ISO 639-3 code detected by franc in the worker. */
  language?: string | null;
  organizationSlug?: string;
  userEmail?: string;
  userId?: string;
  /** The run id, echoed back so a log line can be correlated end to end. */
  requestId?: string;
  /** PII masking policy applied at ingest time. */
  piiPolicy?: PiiPolicy;
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
  /** The active version's text. */
  content: string;
}
export interface OptimizeDocumentPayload {
  jobId: string;
  documentId: string;
  orgId: string;
  projectId?: string | null;
  userId?: string | null;
  documentText: string;
  documentTitle?: string;
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
}
//# sourceMappingURL=contract.d.ts.map
