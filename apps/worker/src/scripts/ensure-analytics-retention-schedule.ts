/* eslint-disable no-console */
/**
 * Create (or update) the Temporal Schedule that prunes `document_retrievals`
 * past the retention window.
 *
 * Run once per environment:
 *
 *   npx tsx src/scripts/ensure-analytics-retention-schedule.ts
 *
 * ## Why a script and not worker startup
 *
 * Same reasoning as `ensure-demo-cleanup-schedule.ts`: a schedule is
 * server-side state in Temporal, not code. Creating it on boot means every
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
import { Client, Connection, ScheduleOverlapPolicy } from '@temporalio/client';

import { TASK_QUEUE_NAME } from '../shared';
import { TEMPORAL_SERVER_ADDRESS, ANALYTICS_RETENTION_DAYS } from '../consts';

const SCHEDULE_ID = 'analytics-retrieval-retention';

/** 03:30 daily — after the demo cleanup at 03:00 rather than alongside it, so
 *  two jobs are not deleting from the same database at the same moment. */
const CRON = '30 3 * * *';

async function main() {
  const deleting = process.argv.includes('--delete');

  const connection = await Connection.connect({
    address: TEMPORAL_SERVER_ADDRESS,
  });

  // try/finally rather than closing on the success path: every branch below
  // can throw, and a Temporal connection left open keeps the process alive
  // after main() has rejected, so the script hangs instead of exiting.
  try {
    const client = new Client({ connection });
    const handle = client.schedule.getHandle(SCHEDULE_ID);

    if (deleting) {
      await handle.delete();
      console.log(`Deleted schedule "${SCHEDULE_ID}".`);
      return;
    }

    const action = {
      type: 'startWorkflow' as const,
      workflowType: 'pruneAnalyticsRetrievals',
      taskQueue: TASK_QUEUE_NAME,
      args: [],
    };

    // A run still going when the next fires must not start a second delete
    // over the same rows.
    const policies = { overlap: ScheduleOverlapPolicy.SKIP };

    try {
      await client.schedule.create({
        scheduleId: SCHEDULE_ID,
        spec: { cronExpressions: [CRON] },
        action,
        policies,
      });
      console.log(`Created schedule "${SCHEDULE_ID}" (${CRON}).`);
    } catch (error) {
      // Re-running this must be safe: the usual reason to run it again is to
      // change the cron, and failing on "already exists" would make that a
      // delete-then-recreate dance.
      if ((error as { name?: string }).name === 'ScheduleAlreadyRunning') {
        await handle.update((previous) => ({
          ...previous,
          spec: { cronExpressions: [CRON] },
          action,
          // Restated rather than inherited: spreading `previous` alone would
          // leave an existing ALLOW_ALL in place, so a schedule created before
          // this policy existed would keep overlapping runs — the one thing
          // the policy prevents, silently preserved by the path meant to bring
          // an old schedule up to date.
          policies: { ...previous.policies, ...policies },
        }));
        console.log(`Updated existing schedule "${SCHEDULE_ID}" (${CRON}).`);
      } else {
        throw error;
      }
    }

    console.log(
      `Retention: ${ANALYTICS_RETENTION_DAYS} days of document_retrievals.\n` +
        'Rows are deleted one organization at a time, so the delete is both\n' +
        'org-scoped for the tenant guard and served by the\n' +
        '(org_id, created_at) index.\n\n' +
        'Note: the worker reads ANALYTICS_RETENTION_DAYS at run time, not from\n' +
        'this schedule. Changing it here without changing it on the worker\n' +
        'service changes nothing.',
    );
  } finally {
    await connection.close();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
