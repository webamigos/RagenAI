/**
 * The vocabulary of a cancelled ingest, with no engine in it.
 *
 * These three lived in `../workflows/signals.ts`, which imports
 * `@temporalio/workflow` for `defineSignal` and `defineQuery`. A handler
 * importing them from there would drag the engine into a file whose whole
 * point is not knowing about one — so the values moved here and `signals.ts`
 * imports them back for the two definitions that genuinely are Temporal's.
 */

/**
 * Coarse progress marker for the embedding pipeline, published through
 * `ctx.progress` so a caller can see roughly where a run is before deciding
 * whether cancelling is still useful.
 */
export type EmbeddingStage = 'parsing' | 'embedding' | 'done';

export type EmbeddingState = {
  stage: EmbeddingStage;
  cancelled: boolean;
};

/**
 * The failure type a cancellation throws with.
 *
 * It lets a pipeline's try/catch tell "already-recorded cancellation" apart
 * from every other non-retryable failure it might catch — the parsing and
 * embedding catch blocks in both ingest handlers depend on that distinction,
 * because one has already written CANCELLED and the other must write FAILED.
 */
export const INGEST_CANCELLED_FAILURE_TYPE = 'IngestCancelled';
