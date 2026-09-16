import { UnrecoverableError, Worker, type ConnectionOptions } from 'bullmq';
import {
  JOB_NAMES,
  type JobName,
  type JobPayloads,
  type JobResults,
  type JobLogger,
} from '@ragenai/jobs';

import { createJobContext, type JobContextDeps } from './context.js';
import { assertNoEviction, type RedisConfigReader } from './redis-health.js';
import { MAINTENANCE_QUEUE, QUEUE_NAMES, queueNameFor } from './queues.js';

/**
 * The consumer half: the `Worker` instances that run the handlers.
 *
 * It lives in this package rather than in `apps/worker` because
 * `jobs-seam-is-the-only-runtime-import` says `bullmq` is imported in one
 * place — and unlike Temporal, which apps/worker imports directly because it
 * always has, BullMQ can hold that line from the start. The app supplies its
 * handlers, its activities, its logger and its cancellation read; none of that
 * is engine-shaped.
 */

/**
 * Connection options a consumer needs and a producer must not have.
 *
 * `maxRetriesPerRequest: null` belongs *here*: a `Worker` holds long-lived
 * blocking reads, and ioredis abandoning a command after twenty attempts would
 * kill the consumer over a blip it should have reconnected through. BullMQ
 * forces it on blocking connections for exactly this reason. A producer keeps
 * its finite budget so an enqueue fails fast instead of hanging a request —
 * see the note in `index.ts`.
 */
export const WORKER_REDIS_DEFAULTS = {
  maxRetriesPerRequest: null,
} as const;

/**
 * How long a job may hold its lock without renewing.
 *
 * Five minutes, not the 30-second default, and the reason is this worker's
 * own workload: `sharp`, `resvg`, `pdfium` and `xlsx` all do CPU work that
 * blocks the event loop, and a blocked loop cannot renew a lock. BullMQ then
 * calls the job stalled and **runs it a second time, in parallel with the
 * first** — two ingests writing the same file's chunks. A 10-minute Docling
 * parse is fine either way, because it awaits I/O and the timer still fires.
 */
export const LOCK_DURATION_MS = 300_000;

/**
 * One redelivery of a stalled job, not the default two.
 *
 * A job that stalls twice is not unlucky, it is blocking the loop, and running
 * it a third time multiplies the damage rather than clearing it.
 */
export const MAX_STALLED_COUNT = 1;

/** Conservative, and not derived from Temporal's number — see the spec's §3. */
export const DEFAULT_CONCURRENCY = 10;

export type JobHandler<N extends JobName> = (
  payload: JobPayloads[N],
  ctx: ReturnType<typeof createJobContext>,
) => Promise<JobResults[N]>;

export type JobHandlers = { [N in JobName]: JobHandler<N> };

export interface CreateWorkersOptions extends Omit<
  JobContextDeps,
  'activities'
> {
  handlers: JobHandlers;
  activities: JobContextDeps['activities'];
  connection?: ConnectionOptions;
  concurrency?: number;
  log: JobLogger;
}

/**
 * Translate a handler's failure into the engine's.
 *
 * The mirror of `asApplicationFailure` on the Temporal side, and load-bearing
 * for the same reason: a handler throws `JobFailure` and never imports an
 * engine's error class, so something has to turn `retryable: false` into
 * BullMQ's `UnrecoverableError`. Without it an unsupported file type is
 * retried on every attempt the queue allows, which is the behaviour the flag
 * exists to prevent.
 */
function asEngineFailure(error: unknown): unknown {
  if (
    error instanceof Error &&
    error.name === 'JobFailure' &&
    (error as Error & { retryable?: boolean }).retryable === false
  ) {
    const failure = new UnrecoverableError(error.message);
    failure.cause = error;
    return failure;
  }

  return error;
}

/**
 * Open one `Worker` per queue, **not yet consuming**.
 *
 * Per queue rather than one for everything, so a queue of slow ingests cannot
 * starve document generation, and each can be given its own concurrency later
 * without reshaping this.
 *
 * `autorun: false` is the load-bearing option. A `Worker` starts taking jobs
 * the moment it is constructed, which would mean the eviction check and the
 * shutdown handler both race work that has already begun — and a failed check
 * would leave workers consuming from a Redis it just refused. Construction and
 * consumption are separated so the caller decides when it is safe to start.
 */
/**
 * The consumers this app is running.
 *
 * An alias rather than `Worker[]` in every signature, so a caller can hold the
 * handle without importing `bullmq` — which the architecture guard forbids
 * outside this package, type-only imports included.
 */
export type BullWorkers = Worker[];

export function createBullWorkers(options: CreateWorkersOptions): BullWorkers {
  const connection: ConnectionOptions = {
    ...(options.connection ?? { url: process.env.REDIS_URL }),
    ...WORKER_REDIS_DEFAULTS,
  };

  const concurrency = options.concurrency ?? DEFAULT_CONCURRENCY;

  return QUEUE_NAMES.map((queueName) => {
    const names = JOB_NAMES.filter((job) => queueNameFor(job) === queueName);

    return new Worker(
      queueName,
      async (job) => {
        const name = job.name as JobName;
        const handler = options.handlers[name];

        if (!handler || !names.includes(name)) {
          // A job on a queue whose worker has no handler for it would
          // otherwise fail with a TypeError several frames in. This happens
          // when a job name is added to the contract and not to the map.
          throw new UnrecoverableError(
            `queue "${queueName}" received job "${job.name}", which it has no handler for`,
          );
        }

        const ctx = createJobContext(job, {
          activities: options.activities,
          log: options.log,
          isCancelled: options.isCancelled,
        });

        try {
          return await (handler as JobHandler<JobName>)(
            job.data as JobPayloads[JobName],
            ctx,
          );
        } catch (error) {
          throw asEngineFailure(error);
        }
      },
      {
        connection,
        autorun: false,
        // The maintenance queue runs the two nightly jobs, which must not
        // overlap. Its ceiling is set globally by `upsertSchedule`; this keeps
        // a single replica from running both at once as well.
        concurrency: queueName === MAINTENANCE_QUEUE ? 1 : concurrency,
        lockDuration: LOCK_DURATION_MS,
        maxStalledCount: MAX_STALLED_COUNT,
      },
    );
  });
}

/**
 * Stop consuming, let running jobs finish, then release the connections.
 *
 * Without this a redeploy kills the process mid-job, the lock expires five
 * minutes later, and BullMQ redelivers work that was nearly done — every
 * deploy paying the `lockDuration` it set for safety. `close()` waits for
 * in-flight jobs by default, which is the behaviour wanted here.
 */
export async function closeBullWorkers(workers: BullWorkers): Promise<void> {
  await Promise.all(workers.map((worker) => worker.close()));
}

/**
 * Check the Redis these workers are pointed at before letting them run.
 *
 * Here rather than in the app because reaching the raw client is
 * bullmq-internal knowledge — `worker.backend.client` is the escape hatch the
 * library documents as Redis-specific — and this package is the one allowed to
 * hold it. The app would otherwise have to name `bullmq` to type the result.
 */
export async function assertQueueRedisHealthy(
  workers: BullWorkers,
  log: JobLogger,
): Promise<void> {
  const worker = workers[0];
  if (!worker) {
    return;
  }

  const client = await worker.backend.client;
  await assertNoEviction(client as unknown as RedisConfigReader, log);
}

/**
 * Begin consuming, once the caller has decided it is safe to.
 *
 * Separate from construction because everything that must happen first — the
 * eviction check, installing the shutdown task — needs the workers to exist
 * and needs them not to be running yet.
 */
export function startBullWorkers(workers: BullWorkers): void {
  for (const worker of workers) {
    void worker.run();
  }
}
