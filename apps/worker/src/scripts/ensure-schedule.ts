/* eslint-disable no-console */
import type { JobRuntime } from '@ragenai/jobs';

import {
  DISABLED_SCHEDULES_ENV,
  disabledScheduleIds,
  findRecurringSchedule,
} from '../schedules.js';

/**
 * What every `ensure-*-schedule.ts` script does, for one entry of
 * `RECURRING_SCHEDULES`: register it now, or delete it with `--delete`.
 *
 * The worker registers the same entry on every boot (`../schedules.ts`), so a
 * script is for doing it *now* — before a restart, against an engine the
 * worker does not boot on (Temporal), or to roll a schedule back. The runtime
 * is passed in rather than taken here so each script calls `jobs()` and
 * `closeJobs()` itself, which `worker-scripts-close-the-job-runtime` checks.
 */
export async function ensureSchedule(
  runtime: Pick<JobRuntime, 'upsertSchedule' | 'deleteSchedule'>,
  id: string,
  {
    argv = process.argv,
    env = process.env,
  }: {
    argv?: readonly string[];
    env?: Readonly<Record<string, string | undefined>>;
  } = {},
): Promise<'registered' | 'deleted'> {
  const { schedule, skipReason } = findRecurringSchedule(id);

  if (argv.includes('--delete')) {
    await runtime.deleteSchedule(schedule.id);
    console.log(`Deleted schedule "${schedule.id}".`);
    // The corollary worth printing: boot registers every schedule in the
    // list, so a delete without the opt-out lasts until the next restart.
    if (!disabledScheduleIds(env).has(schedule.id)) {
      console.log(
        `Note: the worker registers it again on its next start. To keep it ` +
          `deleted, add "${schedule.id}" to ${DISABLED_SCHEDULES_ENV} on the ` +
          'worker service — boot then removes it instead.',
      );
    }
    return 'deleted';
  }

  // Validated before any call: a script that reaches the engine only to
  // reject its own environment has nothing to show for it.
  const reason = skipReason?.(env) ?? null;
  if (reason) {
    throw new Error(`Not registering "${schedule.id}": ${reason}.`);
  }

  // Upsert, so re-running to change the cron is the supported way to do it
  // rather than a delete-then-recreate dance. Both adapters make this
  // idempotent; neither leaves a second schedule behind.
  await runtime.upsertSchedule(schedule);
  console.log(
    `Registered schedule "${schedule.id}" (${schedule.cron} ${schedule.timezone}).`,
  );
  if (disabledScheduleIds(env).has(schedule.id)) {
    console.log(
      `Note: ${DISABLED_SCHEDULES_ENV} names "${schedule.id}" here — if the ` +
        'worker service has the same value, its next start removes it again.',
    );
  }
  return 'registered';
}
