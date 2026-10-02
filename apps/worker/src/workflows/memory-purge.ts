import type { MemoryPurgeResult } from '@ragenai/jobs';

import { memoryPurge as handler } from '../handlers/memory-purge.js';
import { runOnTemporal } from './temporal-context.js';

/** Temporal entry point; the pipeline is in `../handlers`. */
export async function memoryPurge(): Promise<MemoryPurgeResult> {
  return runOnTemporal(handler, undefined);
}
