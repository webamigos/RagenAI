import { type JobName, JOB_NAMES } from '@ragenai/jobs';

/**
 * The queue a job runs on.
 *
 * One queue per job name, so a slow ingest cannot starve document generation
 * and each gets its own concurrency — the spec's C1. The exception is the two
 * scheduled jobs, which share `ragen-maintenance`: they take no payload, run
 * nightly, and must not overlap. A shared queue is what lets a single global
 * concurrency of 1 cover both.
 */
export const MAINTENANCE_QUEUE = 'ragen-maintenance';

const MAINTENANCE_JOBS = new Set<JobName>([
  'cleanupDemoThreads',
  'pruneAnalyticsRetrievals',
]);

export function queueNameFor(job: JobName): string {
  return MAINTENANCE_JOBS.has(job) ? MAINTENANCE_QUEUE : job;
}

/**
 * Every queue this deployment uses, deduplicated.
 *
 * Exported because both halves need the same list and neither should derive
 * it again: the producer opens these to enqueue, and the worker opens the same
 * names to consume. A name computed twice is a job written to a queue nothing
 * reads — silent, and indistinguishable from a worker that is merely slow.
 */
export const QUEUE_NAMES: readonly string[] = [
  ...new Set(JOB_NAMES.map(queueNameFor)),
];
