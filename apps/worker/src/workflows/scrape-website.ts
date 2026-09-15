import { setHandler } from '@temporalio/workflow';
import type { ScrapeWebsitePayload } from '@ragenai/jobs';

import { scrapeWebsite as handler } from '../handlers/scrape-website.js';
import type { EmbeddingStage } from '../handlers/ingest-cancellation.js';
import { cancelEmbeddingSignal, embeddingStateQuery } from './signals.js';
import { runOnTemporal } from './temporal-context.js';

export type { ScrapeWebsitePayload };

/**
 * Temporal entry point; the pipeline is in `../handlers`.
 *
 * The signal and the query are Temporal's, so they stay here: the handler asks
 * `ctx.checkCancelled()` and publishes `ctx.progress(stage)`, and this file is
 * what turns those into a signal-set flag and a queryable state. Cancellation
 * stays cooperative either way — an activity already in flight runs to
 * completion, and the flag takes effect at the next checkpoint.
 */
export async function scrapeWebsite(
  payload: ScrapeWebsitePayload,
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
