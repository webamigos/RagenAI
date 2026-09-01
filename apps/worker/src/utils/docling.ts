import { FileType } from '../types/UserFile';

/** File types that Docling can handle natively via docling-serve. */
export const DOCLING_SUPPORTED_TYPES = new Set<FileType>([
  FileType.PDF,
  FileType.DOCX,
  FileType.PPTX,
  FileType.XLSX,
  FileType.CSV,
  FileType.IMAGE,
  FileType.MARKDOWN,
  FileType.TEXT,
]);
