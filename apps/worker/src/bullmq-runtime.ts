import {
  assertQueueRedisHealthy,
  closeBullWorkers,
  createBullWorkers,
  startBullWorkers,
  startQueueDashboard,
  type BullWorkers,
  type QueueDashboard,
  type JobHandlers,
} from '@ragenai/jobs-bullmq';

import * as activities from './activities/index.js';
import { BRAIN_EXTRACT_CONCURRENCY } from './consts.js';
import { db } from './services/db/index.js';
import { logger } from './services/logger.js';

import { brainExtract } from './handlers/brain-extract.js';
import { brainReconcileFindings } from './handlers/brain-reconcile-findings.js';
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
  brainExtract,
  brainReconcileFindings,
};

/**
 * Concurrency counts whole jobs here, and counted activities on Temporal.
 *
 * `maxConcurrentActivityTaskExecutions: 50` never meant fifty files: one
 * ingest is roughly twenty sequential activities, so copying the number across
 * would have raised real concurrency several fold in one commit. Unset leaves
 * `DEFAULT_CONCURRENCY` in `@ragenai/jobs-bullmq` to answer — 20 since D2
 * measured 10 at roughly twice the per-document latency on a twenty-file
 * upload, not a ceiling anyone has proved.
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

export interface RunningBullMq {
  workers: BullWorkers;
  /** `null` when the dashboard is off, which is the default. */
  dashboard: QueueDashboard | null;
}

export async function startBullMqWorker(): Promise<RunningBullMq> {
  const workers = createBullWorkers({
    handlers,
    activities: activities as unknown as Parameters<
      typeof createBullWorkers
    >[0]['activities'],
    concurrency: resolveConcurrency(),
    // Brain extraction calls a rate-limited provider several times per
    // document; the ceiling holds across replicas (see `jobConcurrency`).
    jobConcurrency: { brainExtract: BRAIN_EXTRACT_CONCURRENCY },
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

  try {
    await startBullWorkers(workers);
  } catch (error) {
    // Setting a ceiling failed before any worker ran. Close and fail the
    // boot, rather than run a queue without the limit it was given.
    await closeBullWorkers(workers).catch(() => undefined);
    throw error;
  }

  // After the workers, and deliberately incapable of stopping them:
  // `startQueueDashboard` returns `null` on any failure rather than throwing,
  // because this runs *after* the workers began consuming and before
  // `runBullMq` registers its shutdown task. A throw here would exit the
  // process with jobs in flight and no drain — stranding every lock for five
  // minutes — over an optional operator surface losing a race for port 8090.
  //
  // Off entirely unless both credentials are set, because it shows every job's
  // payload.
  const dashboard = await startQueueDashboard({
    connection: { url: process.env.REDIS_URL },
    log: logger,
    port: process.env.WORKER_ADMIN_PORT
      ? Number(process.env.WORKER_ADMIN_PORT)
      : undefined,
    user: process.env.WORKER_ADMIN_USER,
    password: process.env.WORKER_ADMIN_PASSWORD,
  });

  logger.info(
    { queues: workers.map((worker) => worker.name) },
    'BullMQ worker started',
  );

  return { workers, dashboard };
}

export { closeBullWorkers };
