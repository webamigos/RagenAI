/* eslint-disable no-console */
/**
 * Create (or update) the schedule that applies per-organization thread
 * retention (spec 2026-10-17-ragen-as-an-on-premises-appliance, B4).
 *
 *   npx tsx src/scripts/ensure-thread-retention-schedule.ts
 *
 * A script, like the other schedules, because a schedule is engine state and
 * every replica would race to create it on every deploy. Unlike them, running
 * it is optional: apps/web upserts the same schedule (same id, so it is a
 * no-op here) the moment an owner or admin turns retention on, and the job
 * deletes nothing for an organization that has not. Run it to register the
 * schedule ahead of that, or after changing `THREAD_RETENTION_SCHEDULE`.
 *
 * The corollary the other scripts document applies here too: removing the job
 * from the code does not remove the schedule. A rollback deletes it with
 * `--delete` — and must also clear `threadRetentionDays` from organizations,
 * or the next save in the panel registers it again.
 */
import { THREAD_RETENTION_SCHEDULE } from '@ragenai/jobs';

import { closeJobs, jobs } from '../jobs.js';

async function main() {
  if (process.argv.includes('--delete')) {
    await jobs().deleteSchedule(THREAD_RETENTION_SCHEDULE.id);
    console.log(`Deleted schedule "${THREAD_RETENTION_SCHEDULE.id}".`);
    return;
  }

  await jobs().upsertSchedule(THREAD_RETENTION_SCHEDULE);
  console.log(
    `Registered schedule "${THREAD_RETENTION_SCHEDULE.id}" (${THREAD_RETENTION_SCHEDULE.cron} ${THREAD_RETENTION_SCHEDULE.timezone}).`,
  );
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => closeJobs());
