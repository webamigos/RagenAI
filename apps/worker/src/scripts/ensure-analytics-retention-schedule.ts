/* eslint-disable no-console */
/**
 * Create (or update) the schedule that prunes `document_retrievals` past the
 * retention window — or delete it with `--delete`.
 *
 *   npx tsx src/scripts/ensure-analytics-retention-schedule.ts [--delete]
 *
 * **The worker registers this schedule itself on every BullMQ boot**
 * (`RECURRING_SCHEDULES` in `../schedules.ts`), so on a normal install there
 * is nothing to run. The script is for registering it now, on a Temporal
 * deployment, or rolling it back. A `--delete` lasts until the next worker
 * start unless the id is also in `WORKER_DISABLED_SCHEDULES`.
 *
 * The corollary people forget still holds: removing the job from the code
 * does not remove the schedule. It keeps firing and failing, so a rollback
 * deletes it here too.
 */
import { closeJobs, jobs } from '../jobs.js';
import { ANALYTICS_RETENTION_DAYS } from '../consts.js';
import { ANALYTICS_RETENTION_SCHEDULE } from '../schedules.js';
import { ensureSchedule } from './ensure-schedule.js';

async function main() {
  const outcome = await ensureSchedule(jobs(), ANALYTICS_RETENTION_SCHEDULE.id);
  if (outcome === 'registered') {
    console.log(
      `Retention: ${ANALYTICS_RETENTION_DAYS} days of document_retrievals.\n` +
        'Note: the worker reads ANALYTICS_RETENTION_DAYS at run time, not from\n' +
        'this schedule. Changing it here without changing it on the worker\n' +
        'service prunes to whatever the worker believes.',
    );
  }
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => closeJobs());
