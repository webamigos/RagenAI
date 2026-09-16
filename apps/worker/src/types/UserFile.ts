/**
 * The `user_files` row, as the worker reads it.
 *
 * It used to be the `runFileEmbeddings` *payload*, which looked like the row
 * and was not: it carried context the row did not have (`organizationSlug`,
 * `userEmail`, `requestId`) and every producer built it by hand. The payload
 * is two identifiers now and the handler reads the row, so this describes the
 * row — timestamps still typed as strings, because they cross an activity
 * boundary as JSON.
 *
 * The three enums it uses are a different matter: those were declared here by
 * hand *and* in `services/db/types/UserFile.ts`, two copies of values the
 * schema already defines. They come from the generated client now, so a new
 * `FileType` cannot exist in the database and be missing from both.
 */
/**
 * `default.js`, not `index.js`, and the distinction is load-bearing.
 *
 * Workflows import these enums, so whatever this file resolves to is bundled
 * into the Temporal workflow sandbox. `default.js` re-exports the generated
 * client's `#main-entry-point`, which resolves *per condition*: Node gets the
 * real client, and Temporal's webpack gets the 25 KB browser build — same enum
 * values, none of the runtime.
 *
 * Naming `index.js` here instead bypasses that and pulls 5 MiB of Prisma
 * runtime into the sandbox, which then fails to build at all because it
 * imports `node:async_hooks`. The workflow bundle went from 1.99 MiB to
 * 14.1 MiB before erroring.
 */
export {
  EmbeddingStatus,
  FileType,
  ParsingStatus,
} from '../../generated/prisma/default.js';

import type {
  EmbeddingStatus as EmbeddingStatusType,
  FileType as FileTypeType,
  ParsingStatus as ParsingStatusType,
} from '../../generated/prisma/default.js';

export interface UserFile {
  id: string;
  organizationId: string;
  fileName: string;
  fileSize: number;
  fileType: FileTypeType;
  createdAt: string | null;
  updatedAt: string | null;
  metadata: unknown;
  documentId: string | null;
  projectId: string | null;
  isUploaded: boolean;
  uploadedAt: string | null;
  parsingStatus: ParsingStatusType;
  parsingStartedAt: string | null;
  parsingCompletedAt: string | null;
  parsingFailedAt: string | null;
  embeddingStatus: EmbeddingStatusType;
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
  /** ISO 639-3 code detected by franc in the Temporal worker. */
  language?: string | null;
  /** Who uploaded it. Notifications and document authorship are attributed here. */
  ownerId?: string | null;
  /** PII masking policy applied at ingest time. */
  piiPolicy?: 'NONE' | 'TOXIC_ONLY' | 'STRICT';
}
