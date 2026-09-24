import { z } from 'zod';

import { dbUuid } from './brain-review.types';

export type BrainDocument = {
  fileId: string;
  fileName: string;
  /** Approved pages citing this document. */
  approvedPages: number;
  candidatePages: number;
  /**
   * `in` — searchable; `withdrawn` — taken out of retrieval on purpose, its
   * knowledge served by Brain's pages; `processing` — ingest running or
   * queued; `failed` — ingest failed or was cancelled.
   */
  retrieval: 'in' | 'withdrawn' | 'processing' | 'failed';
};

export const sourceDocumentInputSchema = z.object({ fileId: dbUuid });

/**
 * - `not-found` — no such document here, or it is Brain's own output.
 * - `not-curated` — no approved page cites it yet; taking it out now would
 *   leave its knowledge unanswerable.
 * - `invalid-status` — not in retrieval (for withdraw) or not withdrawn (for
 *   restore).
 * - `index-unavailable` / `failed-to-start` — the index or the queue refused;
 *   nothing changed.
 */
export type SourceDocumentError =
  | 'invalid-input'
  | 'not-found'
  | 'not-curated'
  | 'invalid-status'
  | 'index-unavailable'
  | 'failed-to-start';

export type SourceDocumentResult =
  { success: true } | { success: false; error: SourceDocumentError };
