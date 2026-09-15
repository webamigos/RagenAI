import type {
  EmbeddingStatus,
  FileType,
  ParsingStatus,
  PiiPolicy,
  RunFileEmbeddingsPayload,
} from './contract';

/**
 * A `user_files` row, as the producers that start an ingest hold it.
 *
 * Declared structurally rather than imported. A shared package cannot name an
 * app's generated Prisma client — `apps/web` and `apps/api` generate their own
 * — and it does not need to: both rows satisfy this shape, and
 * `tests/architecture/job-payload-enums-match-the-schema.test.ts` is what keeps
 * the enum members honest against `prisma/schema.prisma`.
 *
 * `metadata` is `unknown` because Prisma's `JsonValue` is an app type too, and
 * this function only moves the value across.
 */
export interface IngestFileRow {
  id: string;
  organizationId: string;
  fileName: string;
  fileSize: number;
  fileType: FileType;
  createdAt: Date | null;
  updatedAt: Date | null;
  metadata: unknown;
  documentId: string | null;
  projectId: string | null;
  isUploaded: boolean;
  uploadedAt: Date | null;
  parsingStatus: ParsingStatus;
  parsingStartedAt: Date | null;
  parsingCompletedAt: Date | null;
  parsingFailedAt: Date | null;
  embeddingStatus: EmbeddingStatus;
  embeddingStartedAt: Date | null;
  embeddingCompletedAt: Date | null;
  embeddingFailedAt: Date | null;
  /**
   * The row's stored policy, which is the ingest's policy unless the caller
   * says otherwise.
   *
   * A re-embed carries it forward; an upload and a folder-wide policy change
   * both pass a resolved one as an override. Leaving it out of this shape is
   * what made `reembedFileCommand` silently re-ingest a STRICT file under the
   * worker's default — caught by that command's own test, which is the reason
   * it is written down here rather than only in the type.
   */
  piiPolicy: PiiPolicy;
  isBinaryFile: boolean;
  fileExtension: string | null;
  fileMimeType: string | null;
  thumbnailS3Key: string | null;
  sourceFileId: string | null;
  folderId: string | null;
  pageCount: number | null;
  language: string | null;
}

const iso = (value: Date | null): string | null => value?.toISOString() ?? null;

/**
 * Turn a `user_files` row into the payload `runFileEmbeddings` is started with.
 *
 * The row is not the payload, which is the mistake this function exists to
 * stop making in nine places. Nine of its columns are `DateTime` and the
 * payload types all nine as `string | null` — because a payload is JSON on the
 * wire — and every producer spread the row and then converted **some** subset
 * by hand: `reembedFileCommand` converted seven of the nine and left
 * `createdAt` and `updatedAt` as `Date`, the four Drive commands converted
 * none. It never broke, because `client.workflow.start` took `args: unknown[]`
 * and the serializer stringified the dates on the way out — so the payload was
 * right and the type was a lie nobody could see.
 *
 * Going through `JobRuntime.start` types the argument, which is what turned
 * that into nine compile errors. One conversion answers all of them, and the
 * next producer gets it rather than re-deriving which seven fields mattered.
 *
 * It lives here rather than in `apps/web` because `apps/api` holds a ported
 * copy of the same upload pipeline (ADR-21) and would otherwise hold a second
 * copy of this too — which is the duplication ADR-33 exists to stop.
 *
 * `overrides` is what a caller knows that the row does not: the org slug and
 * user the ingest is attributed to, the `requestId` that correlates the logs, a
 * `piiPolicy` resolved from the folder, or a `fileSize`/`fileName` a Drive sync
 * has just changed but not yet written back.
 */
export function toRunFileEmbeddingsPayload(
  file: IngestFileRow,
  overrides: Partial<RunFileEmbeddingsPayload> = {},
): RunFileEmbeddingsPayload {
  return {
    id: file.id,
    organizationId: file.organizationId,
    fileName: file.fileName,
    fileSize: file.fileSize,
    fileType: file.fileType,
    createdAt: iso(file.createdAt),
    updatedAt: iso(file.updatedAt),
    metadata: file.metadata,
    documentId: file.documentId,
    projectId: file.projectId,
    isUploaded: file.isUploaded,
    uploadedAt: iso(file.uploadedAt),
    parsingStatus: file.parsingStatus,
    parsingStartedAt: iso(file.parsingStartedAt),
    parsingCompletedAt: iso(file.parsingCompletedAt),
    parsingFailedAt: iso(file.parsingFailedAt),
    embeddingStatus: file.embeddingStatus,
    embeddingStartedAt: iso(file.embeddingStartedAt),
    embeddingCompletedAt: iso(file.embeddingCompletedAt),
    embeddingFailedAt: iso(file.embeddingFailedAt),
    piiPolicy: file.piiPolicy,
    isBinaryFile: file.isBinaryFile,
    fileExtension: file.fileExtension,
    fileMimeType: file.fileMimeType,
    thumbnailS3Key: file.thumbnailS3Key,
    sourceFileId: file.sourceFileId,
    folderId: file.folderId,
    pageCount: file.pageCount,
    language: file.language,
    ...overrides,
  };
}
