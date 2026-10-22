import type { JobContext, PruneExpiredThreadsResult } from '@ragenai/jobs';

import type * as activities from '../activities/index.js';

/**
 * Daily per-organization thread retention (spec
 * 2026-10-17-ragen-as-an-on-premises-appliance, B4): threads with no new
 * message for the organization's chosen number of days are deleted.
 *
 * The schedule is `THREAD_RETENTION_SCHEDULE` in `src/schedules.ts`, which
 * the worker registers at boot on every installation — an organization with
 * retention off is skipped, so the setting is never on with nothing to run
 * it. Removing this job from the code does not remove the
 * schedule; a rollback runs that script with `--delete`.
 *
 * A failed run costs nothing the next one does not recover: the cutoff comes
 * from the clock, and every deletion is re-checked under a lock.
 */
export async function pruneExpiredThreads(
  _payload: void,
  ctx: JobContext,
): Promise<PruneExpiredThreadsResult> {
  const { pruneExpiredThreads: prune } = ctx.steps<typeof activities>({
    retry: {
      initialInterval: '30 seconds',
      maximumInterval: '5 minutes',
      backoffCoefficient: 2,
      // As for the other nightly deletes: tomorrow's run is the better
      // recovery than retrying for hours into it.
      maximumAttempts: 3,
    },
    // Every organization with a period, each up to its batch ceiling. The
    // analytics prune walks every organization in 30 minutes; this deletes
    // more per row, so it gets longer.
    startToCloseTimeout: '60 minutes',
  });

  const result = await prune();

  ctx.log.info('Thread retention finished', { ...result });

  return result;
}
