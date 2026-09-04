export enum EmbeddingStatus {
  NOT_STARTED = 'NOT_STARTED',
  STARTED = 'STARTED',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}

export enum ParsingStatus {
  NOT_STARTED = 'NOT_STARTED',
  STARTED = 'STARTED',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}

export enum FileType {
  UNKNOWN = 'UNKNOWN',
  TEXT = 'TEXT',
  MARKDOWN = 'MARKDOWN',
  EPUB = 'EPUB',
  PDF = 'PDF',
  SRT = 'SRT',
  URL = 'URL',
  IMAGE = 'IMAGE',
  CSV = 'CSV',
  XLSX = 'XLSX',
  DOCX = 'DOCX',
  PPTX = 'PPTX',
}

export interface UserFile {
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
  /** ISO 639-3 code detected by franc in the Temporal worker. */
  language?: string | null;
  organizationSlug?: string;
  userEmail?: string;
  userId?: string;
  /** Temporal workflow ID used as e2e correlation ID. Set by apps/web's /api/upload. */
  requestId?: string;
  /** PII masking policy applied at ingest time. */
  piiPolicy?: 'NONE' | 'TOXIC_ONLY' | 'STRICT';
}
