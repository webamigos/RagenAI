import type { PruneAnalyticsRetrievalsResult } from '@ragenai/jobs';

import { pruneAnalyticsRetrievals as handler } from '../handlers/prune-analytics-retrievals.js';
import { runOnTemporal } from './temporal-context.js';

export type { PruneAnalyticsRetrievalsResult };

/** Temporal entry point; the pipeline is in `../handlers`. */
export async function pruneAnalyticsRetrievals(): Promise<PruneAnalyticsRetrievalsResult> {
  return runOnTemporal(handler, undefined);
}
