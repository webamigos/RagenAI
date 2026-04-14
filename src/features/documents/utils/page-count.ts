import type { FileType } from '@/generated/prisma/client';

const CHARS_PER_PAGE = 3000;

export function calculatePageCount(
  fileType: FileType,
  options: {
    pdfPages?: number;
    contentLength?: number;
  },
): number {
  if (fileType === 'PDF') {
    return options.pdfPages ?? 1;
  }

  if (fileType === 'IMAGE') {
    return 1;
  }

  // Text-based: DOCX, TXT, MARKDOWN, CSV, XLSX, SRT, EPUB, URL
  const chars = options.contentLength ?? 0;
  return Math.max(Math.ceil(chars / CHARS_PER_PAGE), 1);
}
