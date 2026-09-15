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

/**
 * Whether a caught failure is the cancellation this pipeline already recorded.
 *
 * Duck-typed on `type` rather than on a class, because the two failures a
 * catch block sees have different origins: one is the `JobFailure` the
 * pipeline threw at its own checkpoint, the other is whatever the engine
 * wrapped an activity's error in. Both carry a `type`, and the distinction
 * that matters is the value, not the constructor.
 */
export function isIngestCancellation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'type' in error &&
    (error as { type?: unknown }).type === INGEST_CANCELLED_FAILURE_TYPE
  );
}

/**
 * Whether a caught failure asked not to be retried.
 *
 * Same two origins, two spellings: a `JobFailure` says `retryable: false`, an
 * engine failure says `nonRetryable: true`. A catch block that rewrapped one
 * of them into a generic error would turn a deliberate stop into something
 * that retries five times — which is the behaviour these blocks were written
 * to prevent, so the port has to preserve both spellings rather than the one
 * it happens to throw itself.
 */
export function isNonRetryable(error: unknown): boolean {
  if (error instanceof Error && error.name === 'JobFailure') {
    return (error as Error & { retryable?: boolean }).retryable === false;
  }

  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { nonRetryable?: unknown }).nonRetryable === true
  );
}
