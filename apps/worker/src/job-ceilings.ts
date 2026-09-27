import { type JobName } from '@ragenai/jobs';

import {
  BRAIN_EXTRACT_CONCURRENCY,
  DOCLING_MAX_CONCURRENCY,
} from './consts.js';

/**
 * Jobs that may not run as many at once as `WORKER_CONCURRENCY` allows, and
 * the most of each the whole deployment may run — held across replicas by
 * BullMQ's global concurrency (`jobConcurrency` in `@ragenai/jobs-bullmq`).
 *
 * Each one guards a dependency that has less capacity than the worker:
 *
 * - `brainExtract` calls a rate-limited model several times per document;
 *   Vertex answered 429 at two runs.
 * - `runFileEmbeddings` sends almost every file to Docling, which converts two
 *   at a time and queues the rest in memory. Without a ceiling a burst of
 *   uploads sent 20 per replica at once, and under DOCLING_STRICT the ones it
 *   could not answer in time failed for good (spec
 *   2026-09-26-docling-under-load, A1).
 *
 * Its own module, and not inline in `bullmq-runtime.ts`, so the wiring can be
 * tested without loading every handler and the database.
 */
export const jobConcurrencyCeilings = (): Partial<Record<JobName, number>> => ({
  brainExtract: BRAIN_EXTRACT_CONCURRENCY,
  runFileEmbeddings: DOCLING_MAX_CONCURRENCY,
});
