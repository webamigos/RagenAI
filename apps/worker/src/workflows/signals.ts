import { defineSignal, defineQuery } from '@temporalio/workflow';
import {
  ACTIVITY_CANCEL_EMBEDDING_COMMAND,
  ACTIVITY_EMBEDDING_STATE_QUERY,
} from '../shared.js';

// The stage vocabulary and the cancellation failure type are engine-free and
// live with the handlers; this file keeps only what Temporal defines.
export {
  INGEST_CANCELLED_FAILURE_TYPE,
  type EmbeddingStage,
  type EmbeddingState,
} from '../handlers/ingest-cancellation.js';

import type { EmbeddingState } from '../handlers/ingest-cancellation.js';

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
