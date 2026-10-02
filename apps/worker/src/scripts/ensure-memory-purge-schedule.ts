/* eslint-disable no-console */
/**
 * Create (or update) the schedule that purges expired personal memories and
 * change rows past the undo window (spec
 * 2026-09-27-personal-memory-across-threads, C4).
 *
 * Run once per environment that has `personalMemory` on anywhere:
 *
 *   npx tsx src/scripts/ensure-memory-purge-schedule.ts
 *
 * A script rather than worker startup for the reason the analytics schedule
 * gives: a schedule is engine state, and every replica would race to create
 * it on every deploy. And the same corollary: removing the job from the code
 * does not remove the schedule — a rollback deletes it here too, with
 * `--delete`.
 */
import { jobs } from '../jobs.js';
import { SCHEDULE_TIMEZONE } from './schedule-timezone.js';

const SCHEDULE_ID = 'personal-memory-purge';

/** 04:00 daily — after the demo cleanup (03:00) and the analytics prune
 *  (03:30), so no two nightly deletes run against the database at once. */
const CRON = '0 4 * * *';

async function main() {
  if (process.argv.includes('--delete')) {
    await jobs().deleteSchedule(SCHEDULE_ID);
    console.log(`Deleted schedule "${SCHEDULE_ID}".`);
    return;
  }

  await jobs().upsertSchedule({
    id: SCHEDULE_ID,
    job: 'memoryPurge',
    cron: CRON,
    timezone: SCHEDULE_TIMEZONE,
  });
  console.log(
    `Registered schedule "${SCHEDULE_ID}" (${CRON} ${SCHEDULE_TIMEZONE}).`,
  );
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
