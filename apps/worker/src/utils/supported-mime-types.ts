import { FileType } from '../types/UserFile';

export const SUPPORTED_MIME_TYPES: Record<string, FileType> = {
  'application/pdf': FileType.PDF,
  'application/epub+zip': FileType.EPUB,
  'text/markdown': FileType.MARKDOWN,
  'application/x-subrip': FileType.SRT,
  'text/url': FileType.URL,
  'text/plain': FileType.TEXT,
  'image/jpeg': FileType.IMAGE,
  'image/png': FileType.IMAGE,
  'image/webp': FileType.IMAGE,
  'image/gif': FileType.IMAGE,
  'text/csv': FileType.CSV,
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':
    FileType.XLSX,
  'application/vnd.ms-excel': FileType.XLSX,
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
    FileType.DOCX,
  'application/vnd.openxmlformats-officedocument.presentationml.presentation':
    FileType.PPTX,
  'application/vnd.ms-powerpoint': FileType.PPTX,
};
