import { type FileType } from '../../generated/prisma/client.js';

/**
 * Ported from apps/web's src/app/lib/utils/getFileType.ts and
 * getFileExtension.ts. See docs/adrs/21-monorepo-and-api-decoupling.md.
 *
 * Faithful port: `.md`/`.txt` both map to `TEXT` (not `MARKDOWN`) and
 * unrecognized extensions throw — same as the original, not "fixed"
 * here.
 */
export function getFileType(fileName: string): FileType {
  const lower = fileName.toLowerCase();

  if (lower.endsWith('.srt')) {
    return 'SRT';
  }
  if (lower.endsWith('.epub')) {
    return 'EPUB';
  }
  if (lower.endsWith('.pdf')) {
    return 'PDF';
  }
  if (lower.endsWith('.md') || lower.endsWith('.txt')) {
    return 'TEXT';
  }
  if (
    lower.endsWith('.jpg') ||
    lower.endsWith('.jpeg') ||
    lower.endsWith('.png') ||
    lower.endsWith('.webp') ||
    lower.endsWith('.gif')
  ) {
    return 'IMAGE';
  }
  if (lower.endsWith('.csv')) {
    return 'CSV';
  }
  if (lower.endsWith('.docx')) {
    return 'DOCX';
  }
  if (lower.endsWith('.xlsx') || lower.endsWith('.xls')) {
    return 'XLSX';
  }
  if (lower.endsWith('.pptx') || lower.endsWith('.ppt')) {
    return 'PPTX';
  }

  throw new Error(`Unknown file type: ${fileName}`);
}

export function getFileExtension(fileName: string): string | undefined {
  return fileName.split('.').pop();
}
