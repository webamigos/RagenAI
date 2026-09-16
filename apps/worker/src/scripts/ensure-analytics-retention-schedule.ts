/* eslint-disable no-console */
/**
 * Create (or update) the schedule that prunes `document_retrievals`
 * past the retention window.
 *
 * Run once per environment:
 *
 *   npx tsx src/scripts/ensure-analytics-retention-schedule.ts
 *
 * ## Why a script and not worker startup
 *
 * Same reasoning as `ensure-demo-cleanup-schedule.ts`: a schedule is state in
 * whichever engine is running jobs, not code. Creating it on boot means every
 * replica races to create the same schedule on every deploy.
 *
 * Unlike the demo cleanup, though, **every environment that writes retrieval
 * rows wants this one.** The table has no other reader and no other reaper, so
 * an installation that skips this script has a table that only grows. It is
 * still a script rather than automatic, because acquiring a job that deletes
 * rows should stay a decision somebody took — but the decision here is "yes"
 * for anything past a demo.
 *
 * The corollary people forget: **removing the workflow from the code does not
 * remove the schedule.** It keeps firing and failing. A rollback has to delete
 * it here too — `npx tsx src/scripts/ensure-analytics-retention-schedule.ts --delete`.
 */
import { jobs } from '../jobs.js';
import { SCHEDULE_TIMEZONE } from './schedule-timezone.js';

import { ANALYTICS_RETENTION_DAYS } from '../consts.js';

const SCHEDULE_ID = 'analytics-retrieval-retention';

/** 03:30 daily — after the demo cleanup at 03:00 rather than alongside it, so
 *  two jobs are not deleting from the same database at the same moment. */
const CRON = '30 3 * * *';

async function main() {
  const deleting = process.argv.includes('--delete');

  if (deleting) {
    await jobs().deleteSchedule(SCHEDULE_ID);
    console.log(`Deleted schedule "${SCHEDULE_ID}".`);
    return;
  }

  // Upsert, so re-running to change the cron is the supported way to do it
  // rather than a delete-then-recreate dance. Both adapters make this
  // idempotent; neither leaves a second schedule behind.
  await jobs().upsertSchedule({
    id: SCHEDULE_ID,
    job: 'pruneAnalyticsRetrievals',
    cron: CRON,
    timezone: SCHEDULE_TIMEZONE,
  });

  console.log(
    `Registered schedule "${SCHEDULE_ID}" (${CRON} ${SCHEDULE_TIMEZONE}).`,
  );

  console.log(
    `Retention: ${ANALYTICS_RETENTION_DAYS} days of document_retrievals.\n` +
      'Note: the worker reads ANALYTICS_RETENTION_DAYS at run time, not from\n' +
      'this schedule. Changing it here without changing it on the worker\n' +
      'service prunes to whatever the worker believes.',
  );
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
