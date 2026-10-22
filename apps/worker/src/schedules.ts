import type { JobRuntime, JobSchedule } from '@ragenai/jobs';

/**
 * Every recurring schedule this worker owns, and the one place that registers
 * them at boot.
 *
 * ## Why boot, after all
 *
 * The `ensure-*-schedule.ts` scripts used to be the only way a schedule came
 * into existence, on the argument that a schedule is engine state and that
 * every replica would race to create it. Neither half held up:
 *
 * - **Nothing ran the scripts on a container install.** The on-prem appliance
 *   and a `create-ragen-app` install start the worker image and nothing else,
 *   so `document_retrievals` grew without a reaper and expired personal
 *   memories were never purged — not by a decision, by omission.
 * - **The race is harmless.** BullMQ's `upsertJobScheduler` is keyed by the
 *   schedule id and runs as one Lua script, so N replicas upserting the same
 *   spec at once leave one scheduler with that spec. The jobs integration
 *   suite asserts it (`schedules.jobs-integration.ts`).
 *
 * The decision the scripts protected — "this deployment deletes rows on a
 * timer" — is kept where it matters: a schedule with a precondition carries it
 * here (`skipReason`), and an operator who does not want one names its id in
 * `WORKER_DISABLED_SCHEDULES`, which boot honours by *deleting* it, so the
 * opt-out survives every restart. A `--delete` from a script alone does not:
 * the next boot registers the schedule again, and the script says so.
 *
 * **Adding a schedule is one entry in `RECURRING_SCHEDULES`.** Its script, if
 * it has one, is a thin wrapper over the same entry —
 * `scripts/__tests__/schedules.test.ts` fails on an `ensure-*-schedule.ts`
 * whose schedule is not in this list.
 *
 * BullMQ only: a Temporal deployment (`WORKER_RUNTIME=temporal`, the
 * `ragen-enterprise` image) still creates its schedules with the scripts, which
 * work on either runtime.
 */

/**
 * The timezone every nightly schedule fires in.
 *
 * **This changed when they run, deliberately.** The Temporal schedules these
 * replaced set `cronExpressions` with no timezone, which Temporal reads as
 * UTC — so "03:00 daily", described as quiet hours in Europe/Warsaw, had been
 * firing at 04:00 or 05:00 local depending on the season. Europe/Warsaw is the
 * repository's default timezone and the intent the scripts documented.
 */
export const SCHEDULE_TIMEZONE = 'Europe/Warsaw';

/**
 * The nightly demo reset: stale threads deleted, the demo organization's
 * restrictions re-applied. 03:00 — quiet hours for a demo, well clear of
 * business hours where the showcase is presented.
 */
export const DEMO_CLEANUP_SCHEDULE = {
  id: 'demo-thread-cleanup',
  job: 'cleanupDemoThreads',
  cron: '0 3 * * *',
  timezone: SCHEDULE_TIMEZONE,
} as const satisfies JobSchedule;

/**
 * The prune of `document_retrievals` past `ANALYTICS_RETENTION_DAYS`. 03:30 —
 * after the demo cleanup rather than alongside it, so two jobs are not
 * deleting from the same database at the same moment.
 */
export const ANALYTICS_RETENTION_SCHEDULE = {
  id: 'analytics-retrieval-retention',
  job: 'pruneAnalyticsRetrievals',
  cron: '30 3 * * *',
  timezone: SCHEDULE_TIMEZONE,
} as const satisfies JobSchedule;

/**
 * The purge of expired personal memories and change rows past the undo window
 * (spec 2026-09-27-personal-memory-across-threads, C4). 04:00 — after the
 * other two deletes.
 */
export const MEMORY_PURGE_SCHEDULE = {
  id: 'personal-memory-purge',
  job: 'memoryPurge',
  cron: '0 4 * * *',
  timezone: SCHEDULE_TIMEZONE,
} as const satisfies JobSchedule;

type Env = Readonly<Record<string, string | undefined>>;

export interface RecurringSchedule {
  schedule: JobSchedule;
  /**
   * Why this deployment must not have the schedule, or `null` when it should.
   * Absent means always. Read at boot and by the schedule's script, so the
   * two cannot disagree about the condition.
   */
  skipReason?: (env: Env) => string | null;
}

/** The list. Add a schedule here and every worker boot registers it. */
export const RECURRING_SCHEDULES: readonly RecurringSchedule[] = [
  {
    schedule: DEMO_CLEANUP_SCHEDULE,
    // Kept from the script, which refused to run without it: a worker image
    // that is not the demo must not acquire a nightly job that deletes
    // threads, even one that would skip every run.
    skipReason: (env) =>
      env.DEMO_ORGANIZATION_ID?.trim()
        ? null
        : 'DEMO_ORGANIZATION_ID is not set — the demo cleanup belongs to the showcase install only',
  },
  // Unconditional: the table has no other reaper, so every install that
  // answers questions wants it.
  { schedule: ANALYTICS_RETENTION_SCHEDULE },
  // Unconditional: with `personalMemory` off everywhere there is nothing to
  // purge and the run is a no-op.
  { schedule: MEMORY_PURGE_SCHEDULE },
];

/** The opt-out: comma-separated schedule ids boot removes instead of registering. */
export const DISABLED_SCHEDULES_ENV = 'WORKER_DISABLED_SCHEDULES';

export function disabledScheduleIds(env: Env): Set<string> {
  return new Set(
    (env[DISABLED_SCHEDULES_ENV] ?? '')
      .split(',')
      .map((id) => id.trim())
      .filter((id) => id.length > 0),
  );
}

export function findRecurringSchedule(id: string): RecurringSchedule {
  const entry = RECURRING_SCHEDULES.find((item) => item.schedule.id === id);
  if (!entry) {
    throw new Error(`"${id}" is not in RECURRING_SCHEDULES`);
  }
  return entry;
}

type Log = {
  info: (obj: object, msg: string) => void;
  warn: (obj: object, msg: string) => void;
  error: (obj: object, msg: string) => void;
};

export interface ScheduleRegistration {
  registered: string[];
  /** Named in `WORKER_DISABLED_SCHEDULES`, and deleted. */
  removed: string[];
  /** A precondition was not met; any existing schedule is left alone. */
  skipped: string[];
  failed: string[];
}

/**
 * Upsert every schedule in the list, or delete the disabled ones.
 *
 * **Never throws.** It runs after the workers are consuming, and a schedule
 * is not worth a boot: a failure is logged per schedule at `error` and the
 * rest still run — the same stance as the Docling status publisher. Redis
 * itself was checked before the workers started; what is left is a blip,
 * which the next boot repairs, since every step here is idempotent.
 */
export async function registerRecurringSchedules({
  runtime,
  log,
  env = process.env,
  schedules = RECURRING_SCHEDULES,
}: {
  runtime: Pick<JobRuntime, 'upsertSchedule' | 'deleteSchedule'>;
  log: Log;
  env?: Env;
  schedules?: readonly RecurringSchedule[];
}): Promise<ScheduleRegistration> {
  const result: ScheduleRegistration = {
    registered: [],
    removed: [],
    skipped: [],
    failed: [],
  };
  const disabled = disabledScheduleIds(env);
  const known = new Set(schedules.map((entry) => entry.schedule.id));

  const unknown = [...disabled].filter((id) => !known.has(id));
  if (unknown.length > 0) {
    // Not fatal: an id can outlive the schedule it named. A typo would leave
    // the intended schedule running, which is what the warning is for.
    log.warn(
      { unknown, known: [...known] },
      `${DISABLED_SCHEDULES_ENV} names schedules this worker does not own`,
    );
  }

  for (const { schedule, skipReason } of schedules) {
    try {
      if (disabled.has(schedule.id)) {
        await runtime.deleteSchedule(schedule.id);
        result.removed.push(schedule.id);
        log.info(
          { scheduleId: schedule.id },
          `schedule disabled by ${DISABLED_SCHEDULES_ENV}; removed`,
        );
        continue;
      }

      const reason = skipReason?.(env) ?? null;
      if (reason) {
        result.skipped.push(schedule.id);
        log.info(
          { scheduleId: schedule.id, reason },
          'schedule not registered',
        );
        continue;
      }

      await runtime.upsertSchedule(schedule);
      result.registered.push(schedule.id);
    } catch (err) {
      result.failed.push(schedule.id);
      log.error(
        { err, scheduleId: schedule.id },
        'schedule registration failed; the next worker start retries it',
      );
    }
  }

  log.info(result, 'recurring schedules reconciled');
  return result;
}
