import { setHandler } from '@temporalio/workflow';
import type { RunFileEmbeddingsPayload } from '@ragenai/jobs';

import { runFileEmbeddings as handler } from '../handlers/parse-and-embed.js';
import type { EmbeddingStage } from '../handlers/ingest-cancellation.js';
import { cancelEmbeddingSignal, embeddingStateQuery } from './signals.js';
import { runOnTemporal } from './temporal-context.js';

/**
 * Temporal entry point; the pipeline is in `../handlers`.
 *
 * The signal and the query are Temporal's own, so they stay on this side: the
 * handler asks `ctx.checkCancelled()` at its checkpoints and publishes
 * `ctx.progress(stage)` when it moves between them, and this file turns those
 * into a signal-set flag and a queryable state. Cancellation stays cooperative
 * either way — an activity already in flight (a ten-minute Docling parse, an
 * embedding call) runs to completion, because neither heartbeats.
 */
export async function runFileEmbeddings(
  payload: RunFileEmbeddingsPayload,
): Promise<string> {
  let cancelled = false;
  let stage: EmbeddingStage = 'parsing';

  setHandler(cancelEmbeddingSignal, () => {
    cancelled = true;
  });
  setHandler(embeddingStateQuery, () => ({ stage, cancelled }));

  return runOnTemporal(handler, payload, {
    isCancelled: () => cancelled,
    onProgress: (next) => {
      stage = next;
    },
  });
}
