import { resolveWorkerRuntime, type WorkerRuntime } from '@ragenai/jobs';

/**
 * Why a runtime this build cannot run is refused rather than ignored.
 *
 * `WORKER_RUNTIME=bullmq` is a value the seam accepts and the schema validates
 * — deliberately, so a deployment can be told about `REDIS_URL` at boot rather
 * than at the first upload. What does not exist yet is the adapter that would
 * consume those queues (C1). Without this check the worker would fall through
 * to the Temporal bootstrap below it and connect to `localhost:7233`, then sit
 * there healthy, logging nothing, running nothing: the operator selected
 * BullMQ, every check passed, and no job is ever picked up.
 *
 * The spec's own failure table names that outcome — "a worker that starts and
 * quietly processes nothing is the worse outcome" — which is the whole reason
 * a refusal is the right answer to a runtime that is configured but not built.
 *
 * Delete this when C1 registers the BullMQ adapter; the dispatch replaces it.
 */
export const UNIMPLEMENTED_RUNTIME_MESSAGE =
  'WORKER_RUNTIME=bullmq is accepted by the configuration contract but this build has no BullMQ adapter yet, so it would start and process nothing. Set WORKER_RUNTIME=temporal (or leave it unset) until the adapter ships.';

/**
 * The runtime this process can actually run, or a message explaining why not.
 *
 * Separated from `worker.ts` because that file is a bootstrap with top-level
 * side effects — it connects, creates a worker and runs it on import — so the
 * decision is the only part of it a test can reach.
 */
export function resolveRunnableRuntime(
  env: Record<string, string | undefined> = process.env,
): { ok: true; runtime: WorkerRuntime } | { ok: false; message: string } {
  const runtime = resolveWorkerRuntime(env);

  if (runtime !== 'temporal') {
    return { ok: false, message: UNIMPLEMENTED_RUNTIME_MESSAGE };
  }

  return { ok: true, runtime };
}
