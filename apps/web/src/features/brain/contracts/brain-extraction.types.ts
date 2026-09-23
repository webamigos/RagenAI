import { z } from 'zod';

/** At most this many documents in one run a person starts from the panel. */
export const MAX_DOCUMENTS_PER_RUN = 200;

export const startExtractionInputSchema = z.object({
  fileIds: z.array(z.string().uuid()).min(1).max(MAX_DOCUMENTS_PER_RUN),
});
export type StartExtractionInput = z.infer<typeof startExtractionInputSchema>;

export const retryExtractionInputSchema = z.object({
  findingPublicId: z.string().uuid(),
});
export type RetryExtractionInput = z.infer<typeof retryExtractionInputSchema>;

/**
 * - `no-documents` — none of the files named is one Brain can read here
 *   (another organization's, an import, the vehicle of a published page, or
 *   a file with no parsed document yet).
 * - `failed-to-start` — the queue refused the job; nothing ran.
 */
export type ExtractionError =
  'invalid-input' | 'not-found' | 'no-documents' | 'failed-to-start';

export type ExtractionStartResult =
  | { success: true; documents: number }
  | { success: false; error: ExtractionError };

/** A document the extraction dialog offers. */
export type ExtractableDocument = {
  fileId: string;
  fileName: string;
  /** Pages already citing it, so a reviewer sees what has been extracted. */
  pages: number;
};
