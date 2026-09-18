import { Redis } from 'ioredis';

import type { CancellationSubject, JobRun } from '@ragenai/jobs';
import {
  BullMqJobRuntime,
  redisBackend,
  resetQueueSchemaForTests,
  closeBullWorkers,
  createBullWorkers,
  startBullWorkers,
  type BullWorkers,
  type JobHandlers,
  type QueueBackend,
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
import {
  pollUntilTerminal,
  testLogger,
  type HarnessOptions,
  type JobRuntimeHarness,
} from './harness.js';

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

async function flushTestRedis(): Promise<void> {
  assertOwnDatabase(TEST_REDIS_URL);

  const redis = new Redis(TEST_REDIS_URL, { maxRetriesPerRequest: 1 });
  try {
    await redis.flushdb();
  } finally {
    await redis.quit();
  }
}

/**
 * Where the suite's queues live, and why it is never the application's.
 *
 * The Redis half flushes database 15; the PostgreSQL half drops and rebuilds a
 * schema of its own. Both are destructive by design — each test starts from
 * nothing — which is why neither reads the variable the application uses:
 * `JOBS_TEST_DATABASE_URL` falls back to `DATABASE_URL` because a developer's
 * local database is the only one there, but the *schema* is always the test's
 * own, never `bullmq` and never `public`.
 */
const TEST_POSTGRES_SCHEMA =
  process.env.JOBS_TEST_POSTGRES_SCHEMA ?? 'bullmq_jobs_integration';

function testBackend(): QueueBackend {
  if (process.env.BULLMQ_BACKEND !== 'postgres') {
    return redisBackend(TEST_REDIS_URL);
  }

  const connectionString =
    process.env.JOBS_TEST_DATABASE_URL ?? process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error(
      'BULLMQ_BACKEND=postgres needs JOBS_TEST_DATABASE_URL (or DATABASE_URL) — the suite creates its own schema in that database',
    );
  }

  return {
    kind: 'postgres',
    connection: { connectionString, schema: TEST_POSTGRES_SCHEMA },
  };
}

export async function startBullMqHarness(
  options: HarnessOptions,
): Promise<JobRuntimeHarness> {
  const backend = testBackend();

  if (backend.kind === 'postgres') {
    // Drops the schema and re-runs the migrations, which is this backend's
    // equivalent of `flushdb` — and, unlike the worker's boot path, it happens
    // per harness because each test needs an empty queue rather than a
    // compatible one.
    await resetQueueSchemaForTests(backend, testLogger());
  } else {
    await flushTestRedis();
  }

  const activities = options.activities ?? createMockActivities();

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

  const jobs = new BullMqJobRuntime({ backend });

  const workers: BullWorkers = createBullWorkers({
    handlers,
    activities: activities as unknown as Parameters<
      typeof createBullWorkers
    >[0]['activities'],
    backend,
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
    waitForRun: (runId: string, timeoutMs?: number): Promise<JobRun> =>
      pollUntilTerminal(jobs, runId, timeoutMs),
    async close(): Promise<void> {
      if (consuming) {
        await closeBullWorkers(workers);
        consuming = false;
      }
      await jobs.close();
    },
  };
}
