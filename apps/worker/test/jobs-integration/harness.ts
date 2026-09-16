import { Redis } from 'ioredis';
import type { Mock } from 'vitest';

import {
  resolveWorkerRuntime,
  type CancellationSubject,
  type JobLogger,
  type JobRun,
  type JobRuntime,
  type WorkerRuntime,
} from '@ragenai/jobs';
import {
  BullMqJobRuntime,
  closeBullWorkers,
  createBullWorkers,
  startBullWorkers,
  type BullWorkers,
  type JobHandlers,
} from '@ragenai/jobs-bullmq';

import { createMockActivities } from '../../src/__tests__/fixtures/mock-activities.js';
import { cleanupDemoThreads } from '../../src/handlers/cleanup-demo-threads.js';
import { generateDocument } from '../../src/handlers/generate-document.js';
import { optimizeDocument } from '../../src/handlers/optimize-document.js';
import { pruneAnalyticsRetrievals } from '../../src/handlers/prune-analytics-retrievals.js';
import { reindexDocumentVersion } from '../../src/handlers/reindex-document-version.js';
import { runFileEmbeddings } from '../../src/handlers/parse-and-embed.js';
import { scoreDocument } from '../../src/handlers/score-document.js';
import { scrapeWebsite } from '../../src/handlers/scrape-website.js';

/**
 * One runtime under test, behind the seam's own vocabulary.
 *
 * The suites below start jobs through `JobRuntime` and read them back through
 * `getRun` — never through a queue, a client or an engine's own types — so the
 * same files can be pointed at the other adapter. That is not decoration:
 * §8.3 of the spec promises this suite runs against a real Temporal as well,
 * nightly, and that promise is only affordable if the assertions are already
 * engine-free.
 *
 * **What exists today is the BullMQ implementation.** The Temporal one is
 * Phase E's nightly job (`WORKER_RUNTIME=temporal` here selects it), and
 * `startHarness` says so rather than falling back to BullMQ — a parity suite
 * that silently tested the same engine twice would be worse than no parity
 * suite, because the report would say both.
 */
export interface JobRuntimeHarness {
  /** Which engine this run is exercising, for a failure message to name. */
  readonly runtimeName: WorkerRuntime;

  /** The producer side: what `apps/web` and `apps/api` hold. */
  readonly jobs: JobRuntime;

  /**
   * The activity stubs the handlers are running against, so a test can assert
   * what the pipeline did without a database.
   */
  readonly activities: Record<string, Mock>;

  /** Resolves when the run reaches a terminal state, or the deadline passes. */
  waitForRun(runId: string, timeoutMs?: number): Promise<JobRun>;

  /**
   * The schedule ids the engine currently holds.
   *
   * On the seam this is engine-specific — nothing in the application lists
   * schedules — so it belongs to the harness, which is the layer that knows
   * which engine it started. A Temporal harness answers it from the schedule
   * client.
   */
  listScheduleIds(): Promise<string[]>;

  /** Begin consuming. Called for you unless the harness was started paused. */
  startConsuming(): void;

  /** Stop consuming without tearing the queues down, so state stays readable. */
  stopConsuming(): Promise<void>;

  close(): Promise<void>;
}

export interface HarnessOptions {
  /** Defaults to a fresh `createMockActivities()`. */
  activities?: Record<string, Mock>;
  /**
   * Start the workers, or leave the jobs queued.
   *
   * `false` is how the cancellation suite reaches the only state
   * `requestCancel` acts on — a job the worker has not picked up.
   */
  consume?: boolean;
  concurrency?: number;
  /** Test-only; see `CreateWorkersOptions`. */
  lockDuration?: number;
  stalledInterval?: number;
  handlerOverrides?: Partial<JobHandlers>;
}

/**
 * Where the suite's Redis is, and why it is never the application's.
 *
 * Every test flushes the database it is given, so pointing this at the
 * `REDIS_URL` a developer has in `.env.local` would delete their local queues
 * and rate-limit keys between assertions. The default is therefore the compose
 * Redis on its **own database index** — the same server, a namespace nothing
 * else in this repository writes to.
 */
export const TEST_REDIS_URL =
  process.env.JOBS_TEST_REDIS_URL ?? 'redis://localhost:56379/15';

/**
 * Refuse to flush a database that might not be ours.
 *
 * `flushdb()` deletes every key in the selected logical database, and a Redis
 * URL with no path selects **database 0** — which is where `REDIS_URL` points,
 * and therefore where a developer's own queues, cached organization settings
 * and rate-limit keys live. The comment above promised "its own database
 * index"; a promise in a comment is not a guard, and the failure would be
 * silent and immediate.
 *
 * Any explicit non-zero index is accepted rather than 15 alone: the number is
 * a convention, and a deployment's CI is entitled to pick another. Zero is the
 * one that cannot be distinguished from "nobody chose".
 */
function assertOwnDatabase(url: string): void {
  const database = new URL(url).pathname.replace(/^\//, '');

  if (!/^[1-9][0-9]*$/.test(database)) {
    throw new Error(
      `the jobs integration suite refuses to flush "${url}": its URL selects ` +
        `${database === '' ? 'no database, which means database 0' : `database ${database}`}, ` +
        'and every test here starts by deleting every key in it. Point ' +
        'JOBS_TEST_REDIS_URL at a database of its own — the default is ' +
        'redis://localhost:56379/15.',
    );
  }
}

/** Quiet by default: a failing assertion is the signal, not a retry's log. */
function testLogger(): JobLogger {
  const noop = (): void => {};
  return { debug: noop, info: noop, warn: noop, error: noop };
}

async function flushTestRedis(): Promise<void> {
  assertOwnDatabase(TEST_REDIS_URL);

  const redis = new Redis(TEST_REDIS_URL, { maxRetriesPerRequest: 1 });
  try {
    await redis.flushdb();
  } finally {
    await redis.quit();
  }
}

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

async function startBullMqHarness(
  options: HarnessOptions,
): Promise<JobRuntimeHarness> {
  await flushTestRedis();

  const activities = options.activities ?? createMockActivities();
  const connection = { url: TEST_REDIS_URL };

  const handlers: JobHandlers = {
    runFileEmbeddings,
    scrapeWebsite,
    generateDocument,
    reindexDocumentVersion,
    optimizeDocument,
    scoreDocument,
    cleanupDemoThreads,
    pruneAnalyticsRetrievals,
    ...options.handlerOverrides,
  };

  const jobs = new BullMqJobRuntime({ connection });

  const workers: BullWorkers = createBullWorkers({
    handlers,
    activities: activities as unknown as Parameters<
      typeof createBullWorkers
    >[0]['activities'],
    connection,
    concurrency: options.concurrency,
    lockDuration: options.lockDuration,
    stalledInterval: options.stalledInterval,
    log: testLogger(),
    // The same read the application injects, wired to the same stub the
    // Temporal suite registers as an activity — so a cancellation test reads
    // identically on both runtimes.
    isCancelled: (subject: CancellationSubject) =>
      activities.isIngestCancelled(subject) as Promise<boolean>,
  });

  let consuming = false;
  const startConsuming = (): void => {
    if (!consuming) {
      startBullWorkers(workers);
      consuming = true;
    }
  };

  if (options.consume !== false) {
    startConsuming();
  }

  return {
    runtimeName: 'bullmq',
    jobs,
    activities,
    startConsuming,
    listScheduleIds: () => jobs.listSchedules(),
    async stopConsuming(): Promise<void> {
      if (consuming) {
        await closeBullWorkers(workers);
        consuming = false;
      }
    },
    async waitForRun(runId: string, timeoutMs = 30_000): Promise<JobRun> {
      const deadline = Date.now() + timeoutMs;
      let last: JobRun = { status: 'running' };

      while (Date.now() < deadline) {
        last = await jobs.getRun(runId);
        if (last.status !== 'running') {
          return last;
        }
        await sleep(50);
      }

      throw new Error(
        `run "${runId}" was still ${last.status} after ${timeoutMs}ms`,
      );
    },
    async close(): Promise<void> {
      if (consuming) {
        await closeBullWorkers(workers);
        consuming = false;
      }
      await jobs.close();
    },
  };
}

export async function startHarness(
  options: HarnessOptions = {},
): Promise<JobRuntimeHarness> {
  const runtime = resolveWorkerRuntime();

  if (runtime !== 'bullmq') {
    throw new Error(
      `no integration harness for WORKER_RUNTIME="${runtime}". ` +
        'Only the BullMQ one exists in this repository (D1); the Temporal ' +
        "harness is the nightly parity job of the spec's §8.3, and it lands " +
        'with Phase E. Running this suite against an unimplemented runtime ' +
        'must fail rather than quietly test BullMQ twice.',
    );
  }

  return startBullMqHarness(options);
}
