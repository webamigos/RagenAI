/* eslint-disable no-console */
/**
 * Create (or update) the schedule that purges expired personal memories and
 * change rows past the undo window (spec
 * 2026-09-27-personal-memory-across-threads, C4) — or delete it with
 * `--delete`.
 *
 *   npx tsx src/scripts/ensure-memory-purge-schedule.ts [--delete]
 *
 * **The worker registers this schedule itself on every BullMQ boot**
 * (`RECURRING_SCHEDULES` in `../schedules.ts`). The script is for registering
 * it now, on a Temporal deployment, or rolling it back; a `--delete` lasts
 * until the next worker start unless the id is also in
 * `WORKER_DISABLED_SCHEDULES`.
 */
import { closeJobs, jobs } from '../jobs.js';
import { MEMORY_PURGE_SCHEDULE } from '../schedules.js';
import { ensureSchedule } from './ensure-schedule.js';

async function main() {
  await ensureSchedule(jobs(), MEMORY_PURGE_SCHEDULE.id);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => closeJobs());
