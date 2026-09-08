import { log, proxyActivities } from '@temporalio/workflow';
import type * as activities from '../activities';

export type CleanupDemoThreadsResult = {
  skipped: boolean;
  threadsDeleted: number;
  messagesDeleted: number;
  /** Whether the organization's restrictions were re-applied this run. */
  restrictionsRestored: boolean;
};

/**
 * Nightly reset of the demo organization: its abandoned conversations go, and
 * its restrictions come back.
 *
 * One shared account means prospect B opens the demo and reads prospect A's
 * conversation. That is an accepted consequence of the demo design only
 * because this job bounds how long it lasts.
 *
 * The same account holds the org-admin role, so a visitor can also loosen the
 * tenant — clear a feature override, lift the spend cap. The spec names that
 * as a failure mode with no lock. Re-applying the seeded restrictions here,
 * from the object the seed itself writes (`@ragenai/platform-contracts`),
 * bounds that too. Restrictions first, then threads: if the delete fails and
 * the run is retried, the tenant is at least locked again.
 *
 * The Temporal Schedule that drives it is **not** created here — see
 * `src/scripts/ensure-demo-cleanup-schedule.ts`. A schedule outlives the code
 * that defined it, so removing this workflow does not remove the schedule;
 * that has to be done in Temporal as well.
 *
 * ## How a failed run is noticed, stated plainly
 *
 * The spec's E3 offered a choice: add alerting, or scope this to "the run
 * logs an error and somebody looks at a dashboard" and say which. **This is
 * the second one.**
 *
 * `apps/worker` has no alerting — only OTel and Langfuse — so a failure is
 * visible in three places and none of them will page anyone: the activity
 * throws and Temporal marks the run failed (visible in the Temporal UI's
 * schedule view), the error reaches the OTel logs, and the next night's run
 * simply tries again with a wider window, since staleness is computed from
 * the clock rather than from a cursor.
 *
 * That is an acceptable failure mode for this job specifically: a missed run
 * means yesterday's demo conversation lingers a day longer, not data loss or
 * an outage. It would not be acceptable for a job whose work compounds.
 * Building alerting for the worker is real work and deserves its own
 * decision, not a checkbox inside a cleanup task.
 */
export async function cleanupDemoThreads(): Promise<CleanupDemoThreadsResult> {
  const { deleteStaleDemoThreads, restoreDemoOrganizationRestrictions } =
    proxyActivities<typeof activities>({
      retry: {
        initialInterval: '30 seconds',
        maximumInterval: '5 minutes',
        backoffCoefficient: 2,
        // A nightly job has no reason to retry for hours: the next run is a
        // better recovery than a long backoff, and a run still retrying when
        // the next one starts is how two deletes end up interleaved.
        maximumAttempts: 3,
      },
      startToCloseTimeout: '10 minutes',
    });

  const restore = await restoreDemoOrganizationRestrictions();
  const cleanup = await deleteStaleDemoThreads();

  const result: CleanupDemoThreadsResult = {
    ...cleanup,
    restrictionsRestored: restore.restored,
  };

  if (cleanup.skipped) {
    log.info('Demo cleanup skipped — no demo organization configured');
    return result;
  }

  log.info('Demo cleanup finished', {
    threadsDeleted: result.threadsDeleted,
    messagesDeleted: result.messagesDeleted,
    restrictionsRestored: result.restrictionsRestored,
  });

  return result;
}
