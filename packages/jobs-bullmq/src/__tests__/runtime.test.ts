import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The adapter's job is to make BullMQ answer the seam's questions the way
 * Temporal already does. These assert the places where the two engines differ
 * and the translation could be wrong — not that `bullmq` works.
 */

const fromId = vi.hoisted(() => vi.fn());

class FakeQueue {
  add = vi.fn();
  setGlobalConcurrency = vi.fn();
  upsertJobScheduler = vi.fn();
  removeJobScheduler = vi.fn();
  close = vi.fn();
  constructor(
    public name: string,
    public opts: unknown,
  ) {}
}

vi.mock('bullmq', () => ({
  Queue: FakeQueue,
  Job: { fromId },
}));

const { BullMqJobRuntime, MAINTENANCE_QUEUE, QUEUE_NAMES, queueNameFor } =
  await import('../index.js');

/** A job as the adapter reads it: a state and, when finished, a result. */
const jobIn = (
  state: string,
  extra: Record<string, unknown> = {},
): Record<string, unknown> => ({
  getState: vi.fn(async () => state),
  remove: vi.fn(),
  ...extra,
});

beforeEach(() => {
  vi.clearAllMocks();
  fromId.mockResolvedValue(null);
});

describe('the queue a job goes to', () => {
  it('gives each pipeline its own queue, so one cannot starve another', () => {
    expect(queueNameFor('runFileEmbeddings')).toBe('runFileEmbeddings');
    expect(queueNameFor('generateDocument')).toBe('generateDocument');
  });

  // They take no payload, run nightly, and must not overlap. Sharing a queue
  // is what lets one global concurrency cover both.
  it('puts both scheduled jobs on the maintenance queue', () => {
    expect(queueNameFor('cleanupDemoThreads')).toBe(MAINTENANCE_QUEUE);
    expect(queueNameFor('pruneAnalyticsRetrievals')).toBe(MAINTENANCE_QUEUE);
  });

  it('lists each queue once, so producer and consumer open the same set', () => {
    expect(new Set(QUEUE_NAMES).size).toBe(QUEUE_NAMES.length);
    expect(QUEUE_NAMES).toContain(MAINTENANCE_QUEUE);
  });
});

describe('the producer connection', () => {
  /**
   * `maxRetriesPerRequest: null` is BullMQ's documented setting and belongs to
   * *blocking* connections — a `Worker`'s long reads, which must survive a blip
   * rather than be abandoned after twenty attempts. A `Queue` is not blocking,
   * and setting it here would make an outage hang the caller instead of
   * rejecting: an upload request would wait for Redis to come back rather than
   * failing with the `workflow_start_failed` its call site already handles.
   */
  it('does not disable ioredis retries, so an outage rejects instead of hanging', async () => {
    const runtime = new BullMqJobRuntime();

    await runtime.start('runFileEmbeddings', 'run-1', {} as never);

    const queue = (
      runtime as never as { queues: Map<string, FakeQueue> }
    ).queues.get('runFileEmbeddings')!;
    const { connection } = queue.opts as {
      connection: Record<string, unknown>;
    };

    expect(connection).not.toHaveProperty('maxRetriesPerRequest', null);
  });
});

describe('start', () => {
  it("uses the caller's run id, because the row already holds it", async () => {
    const runtime = new BullMqJobRuntime();

    await runtime.start('runFileEmbeddings', 'reembed-abc', {
      id: 'file-1',
    } as never);

    const queue = (
      runtime as never as { queues: Map<string, FakeQueue> }
    ).queues.get('runFileEmbeddings')!;
    const [name, payload, opts] = queue.add.mock.calls[0];
    expect(name).toBe('runFileEmbeddings');
    expect(payload).toEqual({ id: 'file-1' });
    expect(opts.jobId).toBe('reembed-abc');
  });

  /**
   * A completed job that BullMQ removed immediately reads as `unknown`, and
   * the docgen route answers 404 to that — "your document failed" for one that
   * succeeded. Retention is what keeps the poll honest.
   */
  it('keeps a finished job long enough for the polling UI to read it', async () => {
    const runtime = new BullMqJobRuntime();

    await runtime.start('generateDocument', 'docgen-org-1-x', {} as never);

    const queue = (
      runtime as never as { queues: Map<string, FakeQueue> }
    ).queues.get('generateDocument')!;
    expect(queue.add.mock.calls[0][2].removeOnComplete).toEqual({
      age: 3600,
      count: 1000,
    });
  });
});

describe('getRun', () => {
  it('reports a completed run with its result', async () => {
    fromId.mockResolvedValueOnce(
      jobIn('completed', { returnvalue: { fileId: 'f1' } }),
    );

    expect(await new BullMqJobRuntime().getRun('docgen-1')).toEqual({
      status: 'completed',
      result: { fileId: 'f1' },
    });
  });

  // The seam's states describe a run, and a caller polling one wants "not
  // finished yet". A queued job is not a different answer to that question.
  it.each(['waiting', 'delayed', 'active', 'prioritized'])(
    'reports %s as running',
    async (state) => {
      fromId.mockResolvedValueOnce(jobIn(state));

      expect(await new BullMqJobRuntime().getRun('run-1')).toEqual({
        status: 'running',
      });
    },
  );

  it('carries the failure reason, which is what gets logged', async () => {
    fromId.mockResolvedValueOnce(
      jobIn('failed', { failedReason: 'parser exploded' }),
    );

    expect(await new BullMqJobRuntime().getRun('run-1')).toEqual({
      status: 'failed',
      failure: 'parser exploded',
    });
  });

  /**
   * `unknown` is a real state, not a fallback. Both engines forget finished
   * runs, and the route answers 404 — collapsing it into `failed` would tell a
   * user their document failed when it did not.
   */
  it('answers unknown for a run no queue has heard of', async () => {
    expect(await new BullMqJobRuntime().getRun('gone')).toEqual({
      status: 'unknown',
    });
    // Asked every queue before giving up: a job id is unique per queue, not
    // globally, and the seam hands this method an id alone.
    expect(fromId).toHaveBeenCalledTimes(QUEUE_NAMES.length);
  });
});

describe('requestCancel', () => {
  it('removes a job the worker has not started', async () => {
    const job = jobIn('waiting');
    fromId.mockResolvedValueOnce(job);

    await new BullMqJobRuntime().requestCancel('run-1');

    expect(job.remove).toHaveBeenCalled();
  });

  /**
   * The load-bearing one. Cancelling a *running* ingest is a database fact the
   * pipeline reads at its own checkpoints, and that read is what lets it write
   * CANCELLED before it stops. Removing the job underneath would take the
   * status write away and leave the file in PROCESSING for good.
   */
  it('leaves a running job alone, so the pipeline can record CANCELLED itself', async () => {
    const job = jobIn('active');
    fromId.mockResolvedValueOnce(job);

    await new BullMqJobRuntime().requestCancel('run-1');

    expect(job.remove).not.toHaveBeenCalled();
  });

  it('does not throw when the job started between the read and the remove', async () => {
    const job = jobIn('waiting', {
      remove: vi.fn(async () => {
        throw new Error('Job is locked');
      }),
    });
    fromId.mockResolvedValueOnce(job);

    await expect(
      new BullMqJobRuntime().requestCancel('run-1'),
    ).resolves.toBeUndefined();
  });

  it('is a no-op for a run nothing remembers', async () => {
    await expect(
      new BullMqJobRuntime().requestCancel('gone'),
    ).resolves.toBeUndefined();
  });
});

describe('upsertSchedule', () => {
  const schedule = {
    id: 'demo-cleanup',
    job: 'cleanupDemoThreads',
    cron: '0 3 * * *',
    timezone: 'Europe/Warsaw',
  } as const;

  it('registers the cron in the schedule’s own timezone', async () => {
    const runtime = new BullMqJobRuntime();

    await runtime.upsertSchedule(schedule);

    const queue = (
      runtime as never as { queues: Map<string, FakeQueue> }
    ).queues.get(MAINTENANCE_QUEUE)!;
    expect(queue.upsertJobScheduler).toHaveBeenCalledWith(
      'demo-cleanup',
      { pattern: '0 3 * * *', tz: 'Europe/Warsaw' },
      expect.objectContaining({ name: 'cleanupDemoThreads' }),
    );
  });

  /**
   * Per-worker `concurrency: 1` is not enough: it is per `Worker` instance, so
   * two replicas would each run one and the two nightly runs would overlap.
   * Global concurrency is enforced across every consumer.
   */
  it('pins the maintenance queue to one run at a time, across replicas', async () => {
    const runtime = new BullMqJobRuntime();

    await runtime.upsertSchedule(schedule);

    const queue = (
      runtime as never as { queues: Map<string, FakeQueue> }
    ).queues.get(MAINTENANCE_QUEUE)!;
    expect(queue.setGlobalConcurrency).toHaveBeenCalledWith(1);
  });
});
