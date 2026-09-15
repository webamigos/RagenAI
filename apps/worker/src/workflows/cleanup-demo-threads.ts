import type { CleanupDemoThreadsResult } from '@ragenai/jobs';

import { cleanupDemoThreads as handler } from '../handlers/cleanup-demo-threads.js';
import { runOnTemporal } from './temporal-context.js';

export type { CleanupDemoThreadsResult };

/** Temporal entry point; the pipeline is in `../handlers`. */
export async function cleanupDemoThreads(): Promise<CleanupDemoThreadsResult> {
  return runOnTemporal(handler, undefined);
}
