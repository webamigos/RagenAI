import { Job, Queue, type ConnectionOptions, type JobsOptions } from 'bullmq';
import {
  JOB_NAMES,
  type JobName,
  type JobPayloads,
  type JobRun,
  type JobRunStatus,
  type JobRuntime,
  type JobSchedule,
} from '@ragenai/jobs';

import { QUEUE_NAMES, queueNameFor } from './queues.js';

export { MAINTENANCE_QUEUE, QUEUE_NAMES, queueNameFor } from './queues.js';
export {
  createJobContext,
  runStep,
  DEFAULT_MAX_ATTEMPTS,
  type JobContextDeps,
} from './context.js';
export {
  assertQueueRedisHealthy,
  createBullWorkers,
  closeBullWorkers,
  DEFAULT_CONCURRENCY,
  LOCK_DURATION_MS,
  MAX_STALLED_COUNT,
  WORKER_REDIS_DEFAULTS,
  type BullWorkers,
  type CreateWorkersOptions,
  type JobHandler,
  type JobHandlers,
} from './worker.js';
export {
  assertNoEviction,
  EVICTION_MESSAGE,
  type RedisConfigReader,
} from './redis-health.js';

/**
 * The BullMQ adapter, and the only package in this repository that imports
 * `bullmq` — the same rule `@ragenai/jobs-temporal` follows for `@temporalio/*`,
 * and for the same reason: one architecture guard, and an extraction later that
 * is a `git mv` rather than an archaeology exercise.
 *
 * This is the **producer** half: what `apps/web` and `apps/api` do to a job.
 * Consuming the queues — `Worker` instances, concurrency, lock duration,
 * graceful shutdown — is the worker's bootstrap and lands beside it.
 */

/**
 * A producer connection keeps ioredis's finite retry budget, deliberately.
 *
 * `maxRetriesPerRequest: null` is the setting BullMQ documents, and it is the
 * wrong one here. It applies to *blocking* connections — BullMQ forces it on
 * those itself (`checkBlockingOptions` warns only when
 * `extraOptions.blocking`), because a `Worker`'s long-lived reads must survive
 * a blip rather than be abandoned after twenty attempts. A `Queue` is
 * constructed with `hasBlockingConnection = false`, so nothing requires it of
 * a producer.
 *
 * Setting it anyway would change what an outage looks like at the call site:
 * `start()` would queue the command and wait for Redis to come back rather
 * than rejecting. The spec's failure table says the opposite — "Redis down
 * while a producer enqueues: `jobs.start()` throws; every call site already
 * handles a start failure" — and those call sites do (`workflow_start_failed`
 * in `uploadFileCommand`, the same shape in apps/api). An upload request that
 * hangs until Redis returns is worse than one that fails and says so.
 *
 * The worker's own connections set it, where it belongs, beside the `Worker`
 * instances that need it.
 */

/**
 * How long a finished job stays readable.
 *
 * The document-generation UI polls `getRun` until it sees a result, so a
 * completed job that BullMQ removed immediately would read as `unknown` and
 * the route would answer 404 — "your document failed" for one that succeeded.
 * An hour is far longer than the poll, and the count cap keeps a busy queue
 * from retaining without bound. Failures are kept longer because they are read
 * by a person, not a poller.
 */
export const RETENTION: Pick<JobsOptions, 'removeOnComplete' | 'removeOnFail'> =
  {
    removeOnComplete: { age: 3600, count: 1000 },
    removeOnFail: { age: 24 * 3600, count: 1000 },
  };

/**
 * BullMQ's states in the seam's vocabulary.
 *
 * `waiting`, `delayed` and `waiting-children` are `running` deliberately: the
 * seam's states describe a *run*, and a caller polling one wants "not finished
 * yet". Introducing a `queued` state would be a new answer for the docgen
 * route, which has only ever distinguished running from finished.
 */
const STATUS: Record<string, JobRunStatus> = {
  active: 'running',
  waiting: 'running',
  'waiting-children': 'running',
  delayed: 'running',
  prioritized: 'running',
  paused: 'running',
  completed: 'completed',
  failed: 'failed',
  unknown: 'unknown',
};

export interface BullMqJobRuntimeOptions {
  connection?: ConnectionOptions;
  /** Injectable for tests, and for a process that already opened its queues. */
  queues?: Map<string, Queue>;
}

export class BullMqJobRuntime implements JobRuntime {
  private readonly connection: ConnectionOptions;
  private readonly queues: Map<string, Queue>;
  private readonly ownsQueues: boolean;

  constructor(options: BullMqJobRuntimeOptions = {}) {
    this.connection = options.connection ?? { url: process.env.REDIS_URL };
    this.queues = options.queues ?? new Map();
    this.ownsQueues = options.queues === undefined;
  }

  /**
   * Lazily, and one per name. Constructing a `Queue` opens a Redis connection,
   * and a producer builds a runtime on a request path — so opening all eight
   * to enqueue one job would cost eight connections per process for no reason.
   */
  private queue(name: string): Queue {
    let queue = this.queues.get(name);
    if (!queue) {
      queue = new Queue(name, { connection: this.connection });
      this.queues.set(name, queue);
    }
    return queue;
  }

  async start<N extends JobName>(
    job: N,
    runId: string,
    payload: JobPayloads[N],
  ): Promise<void> {
    await this.queue(queueNameFor(job)).add(job, payload, {
      // The caller's id, as on Temporal: it is already written to
      // `UserFile.workflowId` before the job starts, and a cancel has to find
      // the run again from the row. BullMQ takes a custom `jobId` and treats a
      // duplicate as a no-op, which also makes a double-enqueue harmless.
      jobId: runId,
      ...RETENTION,
    });
  }

  /**
   * Status and result for one run.
   *
   * A `jobId` is unique within a queue rather than globally, and the seam hands
   * this method an id alone — so it asks each queue in turn. That is up to
   * eight `HGETALL`s for a miss, which is affordable because the only caller
   * polls a single document every few seconds; deriving the queue from the id
   * would mean teaching the adapter the producers' id formats, and a run whose
   * prefix was later changed would silently become unfindable.
   */
  async getRun(runId: string): Promise<JobRun> {
    for (const name of QUEUE_NAMES) {
      const job = await Job.fromId(this.queue(name), runId);
      if (!job) {
        continue;
      }

      const state = await job.getState();
      const status = STATUS[state] ?? 'unknown';

      if (status !== 'completed') {
        return status === 'failed'
          ? { status, failure: job.failedReason }
          : { status };
      }

      return { status, result: job.returnvalue as JobRun['result'] };
    }

    // Not an error, and not a failure: both engines forget finished runs, and
    // the route that polls this answers 404 for an id it can no longer
    // describe. Collapsing it into `failed` would tell a user their document
    // failed when it did not.
    return { status: 'unknown' };
  }

  /**
   * Remove a job the worker has not started — and only that.
   *
   * `job.remove()` throws on an active job rather than killing it, which is
   * the behaviour this wants: cancelling a *running* ingest is a database fact
   * the pipeline reads at its own checkpoints, and that is what lets it record
   * CANCELLED before it stops. Removing it underneath would take the status
   * write away and leave the file in PROCESSING for good.
   */
  async requestCancel(runId: string): Promise<void> {
    for (const name of QUEUE_NAMES) {
      const job = await Job.fromId(this.queue(name), runId);
      if (!job) {
        continue;
      }

      const state = await job.getState();
      if (state === 'active' || state === 'completed' || state === 'failed') {
        return;
      }

      try {
        await job.remove();
      } catch {
        // It started between the read and the remove. The row already says
        // CANCELLED, so the pipeline stops at its next checkpoint — there is
        // nothing here worth failing the caller's request over.
      }
      return;
    }
  }

  /**
   * Register or update a nightly job.
   *
   * `upsertJobScheduler` is idempotent and clock-drift-safe by design, so
   * re-running the script that calls this is a no-op rather than a second
   * schedule.
   *
   * **The per-run job id the spec asked for is not reachable here.** BullMQ's
   * `JobSchedulerTemplateOptions` is `Omit<JobsOptions, 'jobId' | ...>` — the
   * scheduler owns the id of each occurrence — so `${scheduleId}-${date}`
   * cannot be supplied as a second line of defence against two nightly runs
   * overlapping. The global concurrency set below is the guarantee, and unlike
   * a per-worker `concurrency: 1` it holds across replicas.
   */
  async upsertSchedule(schedule: JobSchedule): Promise<void> {
    const queue = this.queue(queueNameFor(schedule.job));

    await queue.setGlobalConcurrency(1);
    await queue.upsertJobScheduler(
      schedule.id,
      { pattern: schedule.cron, tz: schedule.timezone },
      { name: schedule.job, opts: RETENTION },
    );
  }

  async deleteSchedule(id: string): Promise<void> {
    // The maintenance queue is where every schedule lives, but the id is what
    // identifies it — ask each queue so a schedule created before a job moved
    // between queues can still be deleted.
    for (const name of QUEUE_NAMES) {
      await this.queue(name).removeJobScheduler(id);
    }
  }

  /** Release the connections this runtime opened, if it opened any. */
  async close(): Promise<void> {
    if (!this.ownsQueues) {
      return;
    }
    await Promise.all([...this.queues.values()].map((queue) => queue.close()));
    this.queues.clear();
  }
}

/** Every job name, for a caller that wants to open all the queues at once. */
export const ALL_JOB_NAMES: readonly JobName[] = JOB_NAMES;
