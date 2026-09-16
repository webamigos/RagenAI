import {
  assertQueueRedisHealthy,
  closeBullWorkers,
  createBullWorkers,
  startBullWorkers,
  type BullWorkers,
  type JobHandlers,
} from '@ragenai/jobs-bullmq';

import * as activities from './activities/index.js';
import { db } from './services/db/index.js';
import { logger } from './services/logger.js';

import { cleanupDemoThreads } from './handlers/cleanup-demo-threads.js';
import { generateDocument } from './handlers/generate-document.js';
import { optimizeDocument } from './handlers/optimize-document.js';
import { pruneAnalyticsRetrievals } from './handlers/prune-analytics-retrievals.js';
import { reindexDocumentVersion } from './handlers/reindex-document-version.js';
import { runFileEmbeddings } from './handlers/parse-and-embed.js';
import { scoreDocument } from './handlers/score-document.js';
import { scrapeWebsite } from './handlers/scrape-website.js';

/**
 * This app's side of the BullMQ runtime.
 *
 * The `Worker` instances are built in `@ragenai/jobs-bullmq`, not here, because
 * `jobs-seam-is-the-only-runtime-import` holds `bullmq` to one package — a rule
 * `@temporalio/*` cannot follow, since this app has imported the Temporal SDK
 * since before the seam existed. What this file supplies is everything that is
 * *not* engine-shaped: the eight handlers, the activities they call, a logger
 * and the cancellation read.
 *
 * Listed one by one rather than spread from `./handlers/index.js`. The map is
 * typed as `JobHandlers`, so a name added to the contract and forgotten here is
 * a compile error — a spread of a namespace would satisfy the type by accident
 * and leave a queue nothing consumes.
 */
const handlers: JobHandlers = {
  runFileEmbeddings,
  scrapeWebsite,
  generateDocument,
  reindexDocumentVersion,
  optimizeDocument,
  scoreDocument,
  cleanupDemoThreads,
  pruneAnalyticsRetrievals,
};

/**
 * Concurrency counts whole jobs here, and counted activities on Temporal.
 *
 * `maxConcurrentActivityTaskExecutions: 50` never meant fifty files: one
 * ingest is roughly twenty sequential activities. Copying the number across
 * would have raised real concurrency several fold in one commit, so the
 * default is the conservative read of the only measurement there is — the
 * 2026-09-05 load test, which ran 20 concurrent ingests twice with no failures
 * and explicitly refused to call 20 a safe ceiling.
 */
function resolveConcurrency(): number | undefined {
  const raw = process.env.WORKER_CONCURRENCY?.trim();
  if (!raw) {
    return undefined;
  }

  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(
      `WORKER_CONCURRENCY="${raw}" is not a positive integer — a worker that silently ran one job at a time would look like a slow queue, not a misconfiguration`,
    );
  }

  return parsed;
}

export async function startBullMqWorker(): Promise<BullWorkers> {
  const workers = createBullWorkers({
    handlers,
    activities: activities as unknown as Parameters<
      typeof createBullWorkers
    >[0]['activities'],
    concurrency: resolveConcurrency(),
    log: logger,
    // The read is injected because the adapter has no database. On Temporal
    // the same read is an activity, since a workflow sandbox has no I/O.
    isCancelled: ({ fileId, orgId }) => db.isIngestCancelled(fileId, orgId),
  });

  // Between construction and consumption, which is why `createBullWorkers`
  // builds them with `autorun: false`. The check borrows a connection that is
  // already configured, and no job can have started while it runs — a failed
  // check that left workers consuming from a Redis it had just refused would
  // be worse than no check.
  try {
    await assertQueueRedisHealthy(workers, logger);
  } catch (error) {
    // Close what was opened before letting the boot fail. Otherwise the
    // process exits holding connections, and the error a reader sees is a
    // socket teardown rather than the eviction policy that caused it.
    await closeBullWorkers(workers).catch(() => undefined);
    throw error;
  }

  startBullWorkers(workers);

  logger.info(
    { queues: workers.map((worker) => worker.name) },
    'BullMQ worker started',
  );

  return workers;
}

export { closeBullWorkers };
