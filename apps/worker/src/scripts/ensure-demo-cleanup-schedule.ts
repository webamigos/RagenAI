/* eslint-disable no-console */
/**
 * Create (or update) the schedule that runs the nightly demo reset — stale
 * threads deleted, the organization's restrictions re-applied — or delete it
 * with `--delete`.
 *
 *   DEMO_ORGANIZATION_ID=<org id> npx tsx src/scripts/ensure-demo-cleanup-schedule.ts [--delete]
 *
 * **The worker registers this schedule itself on every BullMQ boot, but only
 * where `DEMO_ORGANIZATION_ID` is set** (`RECURRING_SCHEDULES` in
 * `../schedules.ts`): an environment that merely runs the worker image must
 * not acquire a job that deletes threads. This script refuses for the same
 * reason. It is for registering the schedule now, on a Temporal deployment,
 * or rolling it back; a `--delete` lasts until the next worker start unless
 * the id is also in `WORKER_DISABLED_SCHEDULES`.
 *
 * Removing the job from the code does not remove the schedule — it keeps
 * firing and failing — so a rollback deletes it here too.
 */
import { closeJobs, jobs } from '../jobs.js';
import {
  DEMO_ORGANIZATION_ID,
  DEMO_THREAD_RETENTION_HOURS,
} from '../consts.js';
import { DEMO_CLEANUP_SCHEDULE } from '../schedules.js';
import { ensureSchedule } from './ensure-schedule.js';

async function main() {
  const outcome = await ensureSchedule(jobs(), DEMO_CLEANUP_SCHEDULE.id);
  if (outcome === 'registered') {
    console.log(
      `Target organization: ${DEMO_ORGANIZATION_ID}\n` +
        `Retention: ${DEMO_THREAD_RETENTION_HOURS}h since a thread's last message.\n` +
        'Each run also re-applies the demo restrictions (feature overrides, spend cap).\n\n' +
        'Note: the worker reads DEMO_ORGANIZATION_ID at run time, not from this\n' +
        'schedule. Setting it here without setting it on the worker service\n' +
        'produces a schedule that fires nightly and does nothing.',
    );
  }
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => closeJobs());
