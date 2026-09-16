import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The two nightly schedules, now registered through the seam rather than
 * against a Temporal client.
 *
 * Worth testing because a schedule is the one piece of state these scripts
 * leave behind in the engine: getting the id or the cron wrong produces a
 * schedule nobody notices until a nightly job stops running, or runs twice.
 */

const upsertSchedule = vi.hoisted(() =>
  vi.fn(async (_schedule: { cron: string }) => undefined),
);
const deleteSchedule = vi.hoisted(() =>
  vi.fn(async (_id: string) => undefined),
);

vi.mock('../../jobs.js', () => ({
  jobs: () => ({ upsertSchedule, deleteSchedule }),
}));

const argv = process.argv;

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  process.argv = ['node', 'script'];
  process.env.DEMO_ORGANIZATION_ID = 'org-demo';
});

afterEach(() => {
  process.argv = argv;
});

const run = async (script: string): Promise<void> => {
  await import(script);
  // The scripts call main() at import time; let its promise settle.
  await new Promise((resolve) => setImmediate(resolve));
};

describe('ensure-demo-cleanup-schedule', () => {
  const script = '../ensure-demo-cleanup-schedule.js';

  it('registers the nightly cleanup with its own id and cron', async () => {
    await run(script);

    expect(upsertSchedule).toHaveBeenCalledWith({
      id: 'demo-thread-cleanup',
      job: 'cleanupDemoThreads',
      cron: '0 3 * * *',
      timezone: 'Europe/Warsaw',
    });
  });

  /**
   * The corollary both scripts document: removing the workflow from the code
   * does not remove the schedule — it keeps firing and failing — so `--delete`
   * is a required rollback step rather than a convenience.
   */
  it('deletes rather than registers when asked', async () => {
    process.argv = ['node', 'script', '--delete'];

    await run(script);

    expect(deleteSchedule).toHaveBeenCalledWith('demo-thread-cleanup');
    expect(upsertSchedule).not.toHaveBeenCalled();
  });
});

describe('ensure-analytics-retention-schedule', () => {
  const script = '../ensure-analytics-retention-schedule.js';

  it('registers the prune half an hour after the cleanup', async () => {
    await run(script);

    expect(upsertSchedule).toHaveBeenCalledWith({
      id: 'analytics-retrieval-retention',
      job: 'pruneAnalyticsRetrievals',
      cron: '30 3 * * *',
      timezone: 'Europe/Warsaw',
    });
  });

  // Staggered on purpose: two jobs deleting from the same database at the same
  // moment is what the 03:30 exists to avoid.
  it('does not share the cleanup’s minute', async () => {
    await run(script);

    expect(upsertSchedule.mock.calls[0]?.[0].cron).not.toBe('0 3 * * *');
  });

  it('deletes rather than registers when asked', async () => {
    process.argv = ['node', 'script', '--delete'];

    await run(script);

    expect(deleteSchedule).toHaveBeenCalledWith(
      'analytics-retrieval-retention',
    );
    expect(upsertSchedule).not.toHaveBeenCalled();
  });
});
