import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { JobSchedule } from '@ragenai/jobs';

import {
  ANALYTICS_RETENTION_SCHEDULE,
  DEMO_CLEANUP_SCHEDULE,
  MEMORY_PURGE_SCHEDULE,
  RECURRING_SCHEDULES,
  THREAD_RETENTION_SCHEDULE,
  disabledScheduleIds,
  registerRecurringSchedules,
} from '../schedules.js';

/**
 * The boot list, against a mocked runtime. What it guards is the bug that
 * made it: a schedule that exists in the code and in no engine, because the
 * one step that created it was a script nobody ran.
 */

const upsertSchedule = vi.fn(async (_schedule: JobSchedule) => undefined);
const deleteSchedule = vi.fn(async (_id: string) => undefined);
const runtime = { upsertSchedule, deleteSchedule };
const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };

const DEMO_ENV = { DEMO_ORGANIZATION_ID: 'org-demo' };

const upserted = (): string[] =>
  upsertSchedule.mock.calls.map(([schedule]) => schedule.id);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('RECURRING_SCHEDULES', () => {
  it('declares each id once', () => {
    const ids = RECURRING_SCHEDULES.map((entry) => entry.schedule.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  // Staggered on purpose: two nightly deletes against the same database at
  // the same minute is what the half-hour steps exist to avoid.
  it('gives each schedule its own minute', () => {
    const crons = RECURRING_SCHEDULES.map((entry) => entry.schedule.cron);
    expect(new Set(crons).size).toBe(crons.length);
  });

  it('fires every schedule in one timezone', () => {
    expect(
      new Set(RECURRING_SCHEDULES.map((entry) => entry.schedule.timezone)),
    ).toEqual(new Set(['Europe/Warsaw']));
  });
});

describe('registerRecurringSchedules', () => {
  it('registers every schedule in the list, exactly as declared', async () => {
    const result = await registerRecurringSchedules({
      runtime,
      log,
      env: DEMO_ENV,
    });

    expect(upsertSchedule).toHaveBeenCalledTimes(RECURRING_SCHEDULES.length);
    for (const { schedule } of RECURRING_SCHEDULES) {
      expect(upsertSchedule).toHaveBeenCalledWith(schedule);
    }
    expect(result.registered).toEqual(
      RECURRING_SCHEDULES.map((entry) => entry.schedule.id),
    );
    expect(deleteSchedule).not.toHaveBeenCalled();
  });

  /**
   * The condition the demo script enforced: a worker image that is not the
   * demo must not acquire a nightly job that deletes threads. And an
   * existing schedule is left alone rather than deleted — the condition says
   * "do not create", not "remove what an operator made".
   */
  it('skips the demo cleanup unless DEMO_ORGANIZATION_ID is set', async () => {
    const result = await registerRecurringSchedules({ runtime, log, env: {} });

    expect(upserted()).toEqual([
      ANALYTICS_RETENTION_SCHEDULE.id,
      MEMORY_PURGE_SCHEDULE.id,
      THREAD_RETENTION_SCHEDULE.id,
    ]);
    expect(result.skipped).toEqual([DEMO_CLEANUP_SCHEDULE.id]);
    expect(deleteSchedule).not.toHaveBeenCalled();
  });

  it('treats a blank DEMO_ORGANIZATION_ID as unset', async () => {
    await registerRecurringSchedules({
      runtime,
      log,
      env: { DEMO_ORGANIZATION_ID: '  ' },
    });
    expect(upserted()).not.toContain(DEMO_CLEANUP_SCHEDULE.id);
  });

  /**
   * The opt-out has to outlast a restart, which a script's `--delete` alone
   * does not — so a disabled schedule is deleted at boot, not merely skipped.
   */
  it('deletes the schedules WORKER_DISABLED_SCHEDULES names', async () => {
    const result = await registerRecurringSchedules({
      runtime,
      log,
      env: {
        ...DEMO_ENV,
        WORKER_DISABLED_SCHEDULES: ` ${ANALYTICS_RETENTION_SCHEDULE.id} ,${DEMO_CLEANUP_SCHEDULE.id}`,
      },
    });

    expect(upserted()).toEqual([
      MEMORY_PURGE_SCHEDULE.id,
      THREAD_RETENTION_SCHEDULE.id,
    ]);
    expect(deleteSchedule.mock.calls.map(([id]) => id)).toEqual([
      DEMO_CLEANUP_SCHEDULE.id,
      ANALYTICS_RETENTION_SCHEDULE.id,
    ]);
    expect(result.removed).toHaveLength(2);
  });

  it('warns about an id it does not own, and still registers the rest', async () => {
    await registerRecurringSchedules({
      runtime,
      log,
      env: { ...DEMO_ENV, WORKER_DISABLED_SCHEDULES: 'analytics-retension' },
    });

    expect(log.warn).toHaveBeenCalledWith(
      expect.objectContaining({ unknown: ['analytics-retension'] }),
      expect.any(String),
    );
    expect(upsertSchedule).toHaveBeenCalledTimes(RECURRING_SCHEDULES.length);
  });

  /**
   * Runs after the workers are consuming: a throw would end a process with
   * jobs in flight. One schedule failing is logged and the others still run.
   */
  it('logs a failed registration and carries on', async () => {
    upsertSchedule.mockRejectedValueOnce(new Error('redis unreachable'));

    const result = await registerRecurringSchedules({
      runtime,
      log,
      env: DEMO_ENV,
    });

    expect(result.failed).toEqual([RECURRING_SCHEDULES[0]?.schedule.id]);
    expect(result.registered).toHaveLength(RECURRING_SCHEDULES.length - 1);
    expect(log.error).toHaveBeenCalledWith(
      expect.objectContaining({
        scheduleId: RECURRING_SCHEDULES[0]?.schedule.id,
      }),
      expect.any(String),
    );
  });

  it('does not throw when every call fails', async () => {
    upsertSchedule.mockRejectedValue(new Error('down'));
    deleteSchedule.mockRejectedValue(new Error('down'));

    await expect(
      registerRecurringSchedules({
        runtime,
        log,
        env: { WORKER_DISABLED_SCHEDULES: MEMORY_PURGE_SCHEDULE.id },
      }),
    ).resolves.toMatchObject({ registered: [], removed: [] });

    upsertSchedule.mockReset();
    deleteSchedule.mockReset();
  });

  /**
   * Several replicas boot at once, and every boot after the first repeats
   * the last. The engine makes an upsert of the same id a no-op (asserted
   * against Redis in `schedules.jobs-integration.ts`); what this side owes
   * is that every boot sends the same specs, so there is nothing for two
   * replicas to disagree about.
   */
  it('sends identical specs on every boot', async () => {
    await registerRecurringSchedules({ runtime, log, env: DEMO_ENV });
    const first = upsertSchedule.mock.calls.map(([schedule]) => schedule);
    upsertSchedule.mockClear();

    await registerRecurringSchedules({ runtime, log, env: DEMO_ENV });

    expect(upsertSchedule.mock.calls.map(([schedule]) => schedule)).toEqual(
      first,
    );
  });
});

describe('disabledScheduleIds', () => {
  it('splits, trims and drops empties', () => {
    expect(
      disabledScheduleIds({ WORKER_DISABLED_SCHEDULES: 'a, b,,  ' }),
    ).toEqual(new Set(['a', 'b']));
  });

  it('is empty when unset', () => {
    expect(disabledScheduleIds({}).size).toBe(0);
  });
});
