import type { RunFileEmbeddingsPayload } from '@ragenai/jobs';

import { runFileEmbeddings as handler } from '../handlers/parse-and-embed.js';
import { runOnTemporal } from './temporal-context.js';

/**
 * Temporal entry point; the pipeline is in `../handlers`.
 *
 * Nothing engine-specific is set up here any more. The signal and the state
 * query used to live in this file — `setHandler(cancelEmbeddingSignal, …)`
 * flipping a boolean in workflow memory, and `setHandler(embeddingStateQuery,
 * …)` answering a poll nothing made. Cancellation is a row now (the spec's
 * §4), so the handler reads it at its own checkpoints and the context turns
 * `ctx.progress` into a log line.
 *
 * Cancellation stays cooperative either way: an activity already in flight — a
 * ten-minute Docling parse, an embedding call — runs to completion, because
 * neither heartbeats.
 */
export async function runFileEmbeddings(
  payload: RunFileEmbeddingsPayload,
): Promise<string> {
  return runOnTemporal(handler, payload);
}
