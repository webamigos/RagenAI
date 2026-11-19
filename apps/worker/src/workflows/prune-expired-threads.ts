import type { PruneExpiredThreadsResult } from '@ragenai/jobs';

import { pruneExpiredThreads as handler } from '../handlers/prune-expired-threads.js';
import { runOnTemporal } from './temporal-context.js';

/** Temporal entry point; the pipeline is in `../handlers`. */
export async function pruneExpiredThreads(): Promise<PruneExpiredThreadsResult> {
  return runOnTemporal(handler, undefined);
}
