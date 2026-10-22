import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

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
  vi.fn(async (_schedule: { id: string; cron: string }) => undefined),
);
const deleteSchedule = vi.hoisted(() =>
  vi.fn(async (_id: string) => undefined),
);

const closeJobs = vi.hoisted(() => vi.fn(async () => undefined));

vi.mock('../../jobs.js', () => ({
  jobs: () => ({ upsertSchedule, deleteSchedule }),
  closeJobs,
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

describe('ensure-memory-purge-schedule', () => {
  const script = '../ensure-memory-purge-schedule.js';

  it('registers the nightly memory purge after the other two deletes', async () => {
    await run(script);
    expect(upsertSchedule).toHaveBeenCalledWith({
      id: 'personal-memory-purge',
      job: 'memoryPurge',
      cron: '0 4 * * *',
      timezone: 'Europe/Warsaw',
    });
  });

  it('deletes the schedule with --delete', async () => {
    process.argv = ['node', 'script', '--delete'];
    await run(script);
    expect(deleteSchedule).toHaveBeenCalledWith('personal-memory-purge');
    expect(upsertSchedule).not.toHaveBeenCalled();
  });
});

describe('ensure-thread-retention-schedule', () => {
  const script = '../ensure-thread-retention-schedule.js';

  it('registers the daily retention run after the other nightly deletes', async () => {
    await run(script);
    expect(upsertSchedule).toHaveBeenCalledWith({
      id: 'thread-retention',
      job: 'pruneExpiredThreads',
      cron: '30 4 * * *',
      timezone: 'Europe/Warsaw',
    });
  });

  // Boot registers the same entry, so the script and boot cannot disagree.
  it('registers exactly the schedule boot registers', async () => {
    const { THREAD_RETENTION_SCHEDULE } = await import('../../schedules.js');
    await run(script);
    expect(upsertSchedule).toHaveBeenCalledWith(THREAD_RETENTION_SCHEDULE);
  });

  it('fires in the zone every other schedule fires in', async () => {
    const { SCHEDULE_TIMEZONE } = await import('../schedule-timezone.js');
    await run(script);
    expect(upsertSchedule.mock.calls[0]?.[0]).toMatchObject({
      timezone: SCHEDULE_TIMEZONE,
    });
  });

  it('shares no minute with the other three deletes', async () => {
    await run(script);
    expect(['0 3 * * *', '30 3 * * *', '0 4 * * *']).not.toContain(
      upsertSchedule.mock.calls[0]?.[0].cron,
    );
  });

  it('deletes the schedule with --delete', async () => {
    process.argv = ['node', 'script', '--delete'];
    await run(script);
    expect(deleteSchedule).toHaveBeenCalledWith('thread-retention');
    expect(upsertSchedule).not.toHaveBeenCalled();
  });
});

// An open queue connection keeps the process alive after the last line, so
// each script releases the runtime whether it registered, deleted or failed.
describe.each([
  '../ensure-demo-cleanup-schedule.js',
  '../ensure-analytics-retention-schedule.js',
  '../ensure-memory-purge-schedule.js',
  '../ensure-thread-retention-schedule.js',
])('%s', (script) => {
  it('closes the job runtime before it ends', async () => {
    await run(script);
    expect(upsertSchedule).toHaveBeenCalled();
    expect(closeJobs).toHaveBeenCalledTimes(1);
  });

  it('closes it after a failure too', async () => {
    upsertSchedule.mockRejectedValueOnce(new Error('redis unreachable'));
    const exitCode = process.exitCode;
    await run(script);
    expect(closeJobs).toHaveBeenCalledTimes(1);
    process.exitCode = exitCode;
  });
});

const SCRIPTS = readdirSync(join(dirname(fileURLToPath(import.meta.url)), '..'))
  .filter((file) => /^ensure-.+-schedule\.ts$/.test(file))
  .map((file) => `../${file.replace(/\.ts$/, '.js')}`)
  .sort();

/**
 * The worker registers `RECURRING_SCHEDULES` at boot, so a script whose
 * schedule is not in that list is the bug the list was made to fix: a
 * schedule that exists only where somebody ran a script. Each script must
 * register exactly one entry of the list — and each entry must have a script,
 * so an operator can always register or roll one back by hand.
 */
describe('ensure-*-schedule scripts and the boot list', () => {
  it('finds the scripts', () => {
    expect(SCRIPTS.length).toBeGreaterThanOrEqual(3);
  });

  it.each(SCRIPTS)(
    '%s registers an entry of RECURRING_SCHEDULES',
    async (script) => {
      const { RECURRING_SCHEDULES } = await import('../../schedules.js');

      await run(script);

      expect(upsertSchedule).toHaveBeenCalledTimes(1);
      expect(RECURRING_SCHEDULES.map((entry) => entry.schedule)).toContainEqual(
        upsertSchedule.mock.calls[0]?.[0],
      );
    },
  );

  it('has a script for every entry of the list', async () => {
    const registered: string[] = [];
    for (const script of SCRIPTS) {
      vi.clearAllMocks();
      vi.resetModules();
      await run(script);
      const schedule = upsertSchedule.mock.calls[0]?.[0];
      if (schedule) {
        registered.push(schedule.id);
      }
    }
    const { RECURRING_SCHEDULES } = await import('../../schedules.js');
    expect(registered.sort()).toEqual(
      RECURRING_SCHEDULES.map((entry) => entry.schedule.id).sort(),
    );
  });
});

describe('ensure-demo-cleanup-schedule without DEMO_ORGANIZATION_ID', () => {
  // The boot list skips it for the same reason; the script refuses outright,
  // since an operator running it asked for something that cannot work.
  it('refuses rather than registering', async () => {
    delete process.env.DEMO_ORGANIZATION_ID;
    const exitCode = process.exitCode;
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    await run('../ensure-demo-cleanup-schedule.js');

    expect(upsertSchedule).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
    process.exitCode = exitCode;
    error.mockRestore();
  });
});

describe('--delete and the boot list', () => {
  /**
   * Boot re-registers every schedule in the list, so a bare `--delete` lasts
   * until the next restart. The script says so, and names the opt-out.
   */
  it('says the worker re-creates the schedule unless it is opted out', async () => {
    process.argv = ['node', 'script', '--delete'];
    delete process.env.WORKER_DISABLED_SCHEDULES;
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});

    await run('../ensure-memory-purge-schedule.js');

    expect(log.mock.calls.flat().join('\n')).toContain(
      'WORKER_DISABLED_SCHEDULES',
    );
    log.mockRestore();
  });

  it('says nothing more once the opt-out names it', async () => {
    process.argv = ['node', 'script', '--delete'];
    process.env.WORKER_DISABLED_SCHEDULES = 'personal-memory-purge';
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});

    await run('../ensure-memory-purge-schedule.js');

    expect(deleteSchedule).toHaveBeenCalledWith('personal-memory-purge');
    expect(log.mock.calls.flat().join('\n')).not.toContain(
      'registers it again',
    );
    log.mockRestore();
    delete process.env.WORKER_DISABLED_SCHEDULES;
  });
});
