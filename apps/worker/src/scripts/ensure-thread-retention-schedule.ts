/* eslint-disable no-console */
/**
 * Create (or update) the schedule that applies per-organization thread
 * retention (spec 2026-10-17-ragen-as-an-on-premises-appliance, B4) — or
 * delete it with `--delete`.
 *
 *   npx tsx src/scripts/ensure-thread-retention-schedule.ts [--delete]
 *
 * **The worker registers this schedule itself on every BullMQ boot**
 * (`RECURRING_SCHEDULES` in `../schedules.ts`), so on a normal install there
 * is nothing to run. The script is for registering it now, on a Temporal
 * deployment, or rolling it back. A `--delete` lasts until the next worker
 * start unless the id is also in `WORKER_DISABLED_SCHEDULES`.
 *
 * The corollary the other scripts document applies here too: removing the job
 * from the code does not remove the schedule. A rollback deletes it with
 * `--delete` and names it in `WORKER_DISABLED_SCHEDULES`.
 */
import { closeJobs, jobs } from '../jobs.js';
import { THREAD_RETENTION_SCHEDULE } from '../schedules.js';
import { ensureSchedule } from './ensure-schedule.js';

async function main() {
  await ensureSchedule(jobs(), THREAD_RETENTION_SCHEDULE.id);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => closeJobs());
