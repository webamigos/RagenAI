import type { FileType } from '../../generated/prisma/client.js';

const CHARS_PER_PAGE = 3000;

/**
 * Ported from apps/web's src/features/documents/utils/page-count.ts. See
 * docs/adrs/21-monorepo-and-api-decoupling.md.
 *
 * Pure function, no I/O — operates on already-known metadata (pdf page
 * count, content length), not file bytes, so it doesn't need S3.
 */
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

  const chars = options.contentLength ?? 0;
  return Math.max(Math.ceil(chars / CHARS_PER_PAGE), 1);
}
