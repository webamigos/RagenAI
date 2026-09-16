/* eslint-disable no-console */
/**
 * Create (or update) the schedule that runs the nightly demo reset:
 * stale threads are deleted and the organization's restrictions re-applied.
 *
 * Run once per environment that needs it:
 *
 *   DEMO_ORGANIZATION_ID=<org id> npx tsx src/scripts/ensure-demo-cleanup-schedule.ts
 *
 * ## Why a script and not worker startup
 *
 * A schedule is state in whichever engine is running jobs, not code. Creating
 * it when the
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
import { jobs } from '../jobs.js';
import {
  DEMO_ORGANIZATION_ID,
  DEMO_THREAD_RETENTION_HOURS,
} from '../consts.js';
import { SCHEDULE_TIMEZONE } from './schedule-timezone.js';

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

  const schedule = {
    id: SCHEDULE_ID,
    job: 'cleanupDemoThreads',
    cron: CRON,
    timezone: SCHEDULE_TIMEZONE,
  } as const;

  if (deleting) {
    await jobs().deleteSchedule(SCHEDULE_ID);
    console.log(`Deleted schedule "${SCHEDULE_ID}".`);
    return;
  }

  // Upsert, so re-running to change the cron is the supported way to do it
  // rather than a delete-then-recreate dance. Both adapters make this
  // idempotent; neither leaves a second schedule behind.
  await jobs().upsertSchedule(schedule);
  console.log(
    `Registered schedule "${SCHEDULE_ID}" (${CRON} ${SCHEDULE_TIMEZONE}).`,
  );

  console.log(
    `Target organization: ${DEMO_ORGANIZATION_ID}\n` +
      `Retention: ${DEMO_THREAD_RETENTION_HOURS}h since a thread's last message.\n` +
      'Each run also re-applies the demo restrictions (feature overrides, spend cap).\n\n' +
      'Note: the worker reads DEMO_ORGANIZATION_ID at run time, not from this\n' +
      'schedule. Setting it here without setting it on the worker service\n' +
      'produces a schedule that fires nightly and does nothing.',
  );
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
