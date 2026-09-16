import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Construction and consumption are separate here, and that separation is the
 * whole safety property: a `Worker` takes jobs the moment it exists, so
 * anything that must happen first — the eviction check, installing the
 * shutdown task — has to happen between the two.
 */

const constructed: FakeWorker[] = [];

class FakeWorker {
  run = vi.fn(async () => undefined);
  close = vi.fn(async () => undefined);
  backend = { client: Promise.resolve({ config: vi.fn() }) };
  constructor(
    public name: string,
    public processor: (job: unknown) => Promise<unknown>,
    public opts: Record<string, unknown>,
  ) {
    constructed.push(this);
  }
}

class FakeUnrecoverableError extends Error {}

vi.mock('bullmq', () => ({
  Worker: FakeWorker,
  UnrecoverableError: FakeUnrecoverableError,
  Queue: class {},
  Job: { fromId: vi.fn() },
}));

const { createBullWorkers, startBullWorkers, closeBullWorkers, QUEUE_NAMES } =
  await import('../index.js');

const log = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };

const build = () =>
  createBullWorkers({
    handlers: {} as never,
    activities: {},
    log,
    isCancelled: async () => false,
  });

beforeEach(() => {
  constructed.length = 0;
  vi.clearAllMocks();
});

describe('createBullWorkers', () => {
  it('opens one worker per queue', () => {
    expect(build()).toHaveLength(QUEUE_NAMES.length);
  });

  /**
   * Without this the eviction check races jobs that have already started, and
   * a check that fails leaves workers consuming from a Redis it just refused.
   */
  it('does not start consuming on construction', () => {
    build();

    expect(constructed.every((worker) => worker.opts.autorun === false)).toBe(
      true,
    );
    expect(
      constructed.every((worker) => worker.run.mock.calls.length === 0),
    ).toBe(true);
  });

  // A blocked event loop cannot renew a lock; BullMQ then calls the job
  // stalled and runs it a second time in parallel, which for an ingest means
  // two runs writing the same file's chunks.
  it('gives every queue the long lock and a single stall allowance', () => {
    build();

    expect(
      constructed.every(
        (worker) =>
          worker.opts.lockDuration === 300_000 &&
          worker.opts.maxStalledCount === 1,
      ),
    ).toBe(true);
  });

  /**
   * The lock and the sweep are overridable, and nothing in the application
   * overrides them.
   *
   * The integration suite does, because the production numbers mean waiting
   * five minutes for a stalled job to come back — and a suite that could not
   * shorten them would have asserted the settings instead of the behaviour,
   * which is how `maxStalledCount: 1` would have gone untested. The default
   * has to stay the long one, which is what the assertion above says and this
   * one keeps honest.
   */
  it('takes a shorter lock and sweep when a caller asks, and offers no sweep otherwise', () => {
    build();
    expect(constructed[0]!.opts.stalledInterval).toBeUndefined();

    constructed.length = 0;
    createBullWorkers({
      handlers: {} as never,
      activities: {},
      log,
      isCancelled: async () => false,
      lockDuration: 1_000,
      stalledInterval: 1_000,
    });

    expect(
      constructed.every(
        (worker) =>
          worker.opts.lockDuration === 1_000 &&
          worker.opts.stalledInterval === 1_000,
      ),
    ).toBe(true);
  });

  /**
   * The default is measured, so a change to it has to face the measurement.
   *
   * D2 compared the two engines on the same twenty-document upload: at 10 the
   * median per document was 24.9s against Temporal's 12.5s, all of it waiting
   * for a slot, and at 20 it is 12.3s. Twenty is parity with the engine being
   * replaced, which is the port's whole promise — so this number is not a
   * taste, and lowering it should come with a reason and a run.
   */
  it('gives every ingest queue the measured default', () => {
    build();

    const ingest = constructed.filter(
      (worker) => worker.name !== 'ragen-maintenance',
    );

    expect(ingest.length).toBeGreaterThan(0);
    expect(ingest.every((worker) => worker.opts.concurrency === 20)).toBe(true);
  });

  // Per-worker, on top of the global ceiling `upsertSchedule` sets: this keeps
  // one replica from running both nightly jobs at once.
  it('pins the maintenance queue to one job at a time', () => {
    build();

    const maintenance = constructed.find(
      (worker) => worker.name === 'ragen-maintenance',
    )!;
    expect(maintenance.opts.concurrency).toBe(1);
  });

  it('keeps the blocking-connection retry setting consumers need', () => {
    build();

    expect(
      (constructed[0].opts.connection as Record<string, unknown>)
        .maxRetriesPerRequest,
    ).toBeNull();
  });
});

describe('startBullWorkers', () => {
  it('starts every worker, and only when asked', () => {
    const workers = build();
    expect(constructed.every((w) => w.run.mock.calls.length === 0)).toBe(true);

    startBullWorkers(workers);

    expect(constructed.every((w) => w.run.mock.calls.length === 1)).toBe(true);
  });
});

describe('closeBullWorkers', () => {
  it('closes every worker, so a redeploy does not strand locks', async () => {
    const workers = build();

    await closeBullWorkers(workers);

    expect(constructed.every((w) => w.close.mock.calls.length === 1)).toBe(
      true,
    );
  });
});
