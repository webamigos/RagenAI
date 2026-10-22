import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The binding `worker.ts` calls at boot. Five lines, and the only place the
 * list meets the real runtime — if it stopped calling, every install would be
 * back to schedules that exist only where someone ran a script.
 */

const runtime = vi.hoisted(() => ({
  upsertSchedule: vi.fn(async () => undefined),
  deleteSchedule: vi.fn(async () => undefined),
}));
const jobs = vi.hoisted(() => vi.fn(() => runtime));
const closeJobs = vi.hoisted(() => vi.fn(async () => undefined));
const logger = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

vi.mock('../jobs.js', () => ({ jobs, closeJobs }));
vi.mock('../services/logger.js', () => ({ logger }));

import { RECURRING_SCHEDULES } from '../schedules.js';
import { registerSchedulesAtBoot } from '../schedules-at-boot.js';

beforeEach(() => {
  vi.clearAllMocks();
  process.env.DEMO_ORGANIZATION_ID = 'org-demo';
  delete process.env.WORKER_DISABLED_SCHEDULES;
});

describe('registerSchedulesAtBoot', () => {
  it('registers the list on the worker’s runtime, reading the process env', async () => {
    await registerSchedulesAtBoot();

    expect(runtime.upsertSchedule).toHaveBeenCalledTimes(
      RECURRING_SCHEDULES.length,
    );
  });

  it('honours WORKER_DISABLED_SCHEDULES from the process env', async () => {
    process.env.WORKER_DISABLED_SCHEDULES = 'personal-memory-purge';

    await registerSchedulesAtBoot();

    expect(runtime.deleteSchedule).toHaveBeenCalledWith(
      'personal-memory-purge',
    );
    delete process.env.WORKER_DISABLED_SCHEDULES;
  });

  // This process consumes; nothing else in it holds the producer's queues.
  it('closes the producer’s connections afterwards', async () => {
    await registerSchedulesAtBoot();
    expect(closeJobs).toHaveBeenCalledTimes(1);
  });

  it('logs and resolves when the runtime cannot be reached at all', async () => {
    jobs.mockImplementationOnce(() => {
      throw new Error('no adapter registered');
    });

    await expect(registerSchedulesAtBoot()).resolves.toBeUndefined();
    expect(logger.error).toHaveBeenCalled();
    expect(closeJobs).toHaveBeenCalledTimes(1);
  });

  it('resolves even when closing fails', async () => {
    closeJobs.mockRejectedValueOnce(new Error('socket closed'));
    await expect(registerSchedulesAtBoot()).resolves.toBeUndefined();
  });
});
