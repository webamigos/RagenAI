import { type UserDocument } from './UserDocument';

export enum EmbeddingStatus {
  NOT_STARTED = 'NOT_STARTED',
  STARTED = 'STARTED',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
}

export enum ParsingStatus {
  NOT_STARTED = 'NOT_STARTED',
  STARTED = 'STARTED',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
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
  organization_id: string;
  file_name: string;
  file_size: number;
  file_type: FileType;
  created_at: Date | null;
  updated_at: Date | null;
  project_id: string | null;
  document_id: UserDocument['id'];
  is_uploaded: boolean;
  uploaded_at: Date | null;
  parsing_status: ParsingStatus;
  parsing_started_at: Date | null;
  parsing_completed_at: Date | null;
  parsing_failed_at: Date | null;
  embedding_status: EmbeddingStatus;
  embedding_started_at: Date | null;
  embedding_completed_at: Date | null;
  embedding_failed_at: Date | null;
  is_binary_file: boolean;
  file_extension?: string;
  file_mime_type?: string;
  user_id?: string;
  thumbnail_s3_key?: string;
  page_count?: number | null;
  // ISO 639-3 code detected by franc in the Temporal worker.
  language?: string | null;
  // Set from apps/web at start for runFileEmbeddings; set by scrapeWebsite
  // itself (the one workflow that creates its own UserFile row mid-run).
  workflow_id?: string | null;
  // JSONB column — free-form enrichment set at ingest time (summary,
  // Google Drive import fields, etc.). Updated in place with `||` merge.
  metadata?: Record<string, unknown> | null;
}
