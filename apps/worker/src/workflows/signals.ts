import { defineSignal, defineQuery } from '@temporalio/workflow';
import {
  ACTIVITY_CANCEL_EMBEDDING_COMMAND,
  ACTIVITY_EMBEDDING_STATE_QUERY,
} from '../shared';

/**
 * Coarse progress marker for the embedding pipeline, exposed via
 * `embeddingStateQuery` so a caller can see roughly where a run is before
 * deciding whether cancelling is still useful.
 */
export type EmbeddingStage = 'parsing' | 'embedding' | 'done';

export type EmbeddingState = {
  stage: EmbeddingStage;
  cancelled: boolean;
};

/**
 * Shared by `runFileEmbeddings` and `scrapeWebsite`. Cancellation here is
 * cooperative, not preemptive: an activity already in flight (a 10-minute
 * Docling parse, an embedding call) runs to completion — the signal only
 * takes effect at the next checkpoint the workflow itself checks. Neither
 * activity heartbeats, so there is no lower-level way to interrupt one mid
 * flight without adding that to every activity first.
 *
 * Names come from `../shared` (`ACTIVITY_CANCEL_EMBEDDING_COMMAND` /
 * `ACTIVITY_EMBEDDING_STATE_QUERY`) so the worker and apps/web, which sends
 * the signal, can never drift on the string.
 */
export const cancelEmbeddingSignal = defineSignal(
  ACTIVITY_CANCEL_EMBEDDING_COMMAND,
);
export const embeddingStateQuery = defineQuery<EmbeddingState>(
  ACTIVITY_EMBEDDING_STATE_QUERY,
);
