/* eslint-disable no-console */
/**
 * Create (or update) the Temporal Schedule that runs the nightly demo reset:
 * stale threads are deleted and the organization's restrictions re-applied.
 *
 * Run once per environment that needs it:
 *
 *   DEMO_ORGANIZATION_ID=<org id> npx tsx src/scripts/ensure-demo-cleanup-schedule.ts
 *
 * ## Why a script and not worker startup
 *
 * A schedule is server-side state in Temporal, not code. Creating it when the
 * worker boots would mean every replica racing to create the same schedule on
 * every deploy, and — worse — an environment that merely runs the worker image
 * would acquire a job that deletes threads. Making it an explicit, per
 * environment action keeps "this deployment cleans up conversations" a
 * decision somebody took.
 *
 * The corollary, which is the part people forget: **removing the workflow from
 * the code does not remove the schedule.** It keeps firing and failing. A
 * rollback has to delete it here too — `npx tsx src/scripts/ensure-demo-cleanup-schedule.ts --delete`.
 */
import { Client, Connection, ScheduleOverlapPolicy } from '@temporalio/client';

import { TASK_QUEUE_NAME } from '../shared';
import {
  TEMPORAL_SERVER_ADDRESS,
  DEMO_ORGANIZATION_ID,
  DEMO_THREAD_RETENTION_HOURS,
} from '../consts';

const SCHEDULE_ID = 'demo-thread-cleanup';

/** 03:00 daily. Quiet hours for a demo, and well clear of business hours in
 *  Europe/Warsaw where the showcase is presented. */
const CRON = '0 3 * * *';

async function main() {
  const deleting = process.argv.includes('--delete');

  // Validated before connecting: a script that opens a connection only to
  // reject its own arguments has nothing to close.
  if (!deleting && !DEMO_ORGANIZATION_ID) {
    throw new Error(
      'DEMO_ORGANIZATION_ID is not set. The schedule would create a workflow that skips every run — set it to the showcase organization before creating the schedule.',
    );
  }

  const connection = await Connection.connect({
    address: TEMPORAL_SERVER_ADDRESS,
  });

  // try/finally, not a close on the success path. Every branch below can
  // throw — a missing schedule on --delete, a rejected create, a failed
  // update — and a Temporal connection left open keeps the process alive
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
      workflowType: 'cleanupDemoThreads',
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
      // change the cron or the target, and failing on "already exists" would
      // make that a delete-then-recreate dance.
      if ((error as { name?: string }).name === 'ScheduleAlreadyRunning') {
        await handle.update((previous) => ({
          ...previous,
          spec: { cronExpressions: [CRON] },
          action,
          // Restated rather than inherited from `previous`. Spreading alone
          // would leave an existing ALLOW_ALL in place, so a schedule created
          // before this policy existed would keep overlapping runs — the one
          // thing the policy is here to prevent, silently preserved by the
          // path that is supposed to bring an old schedule up to date.
          policies: { ...previous.policies, ...policies },
        }));
        console.log(`Updated existing schedule "${SCHEDULE_ID}" (${CRON}).`);
      } else {
        throw error;
      }
    }

    console.log(
      `Target organization: ${DEMO_ORGANIZATION_ID}\n` +
        `Retention: ${DEMO_THREAD_RETENTION_HOURS}h since a thread's last message.\n` +
        'Each run also re-applies the demo restrictions (feature overrides, spend cap).\n\n' +
        'Note: the worker reads DEMO_ORGANIZATION_ID at run time, not from this\n' +
        'schedule. Setting it here without setting it on the worker service\n' +
        'produces a schedule that fires nightly and does nothing.',
    );
  } finally {
    await connection.close();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
