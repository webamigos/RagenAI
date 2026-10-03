import type { JobContext, MemoryPurgeResult } from '@ragenai/jobs';

import type * as activities from '../activities/index.js';

/**
 * Nightly purge of expired personal memories and change rows past the undo
 * window (spec 2026-09-27-personal-memory-across-threads, C4).
 *
 * The schedule that drives it is created by
 * `src/scripts/ensure-memory-purge-schedule.ts`, not here — a schedule is
 * engine state that outlives the code, as the analytics prune's comment
 * explains. A failed night costs nothing the next night does not recover:
 * the cutoffs come from the clock.
 */
export async function memoryPurge(
  _payload: void,
  ctx: JobContext,
): Promise<MemoryPurgeResult> {
  const { purgeExpiredMemories } = ctx.steps<typeof activities>({
    retry: {
      initialInterval: '30 seconds',
      maximumInterval: '5 minutes',
      backoffCoefficient: 2,
      maximumAttempts: 3,
    },
    startToCloseTimeout: '10 minutes',
  });
  const result = await purgeExpiredMemories();
  ctx.log.info('Personal memory purge finished', { ...result });
  return result;
}
