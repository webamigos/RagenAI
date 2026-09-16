import {
  getJobRuntime,
  registerJobRuntime,
  resolveWorkerRuntime,
  type JobRuntime,
} from '@ragenai/jobs';
import { BullMqJobRuntime } from '@ragenai/jobs-bullmq';

/**
 * The job runtime, as `apps/worker` sees it.
 *
 * The same shape as `apps/web`'s `libs/jobs`, and for the same reason:
 * registration is a module side effect, so a caller that reached for
 * `getJobRuntime()` without importing this file would get the seam's "no
 * adapter registered" error instead of a client.
 *
 * This app is the one that *runs* jobs, so it barely needs a producer — the
 * two schedule scripts are the whole of it. They need it for the reason the
 * scripts exist at all: a schedule is state in the engine, and which engine
 * that is now follows `WORKER_RUNTIME` rather than being Temporal by
 * construction.
 *
 * **Only the selected runtime's adapter is loaded**, which is the difference
 * from `apps/web` and `apps/api`. Both of those register eagerly, because a
 * Next or Nest build traces static imports and a computed specifier would not
 * survive bundling. This app is plain Node, and its image is built without
 * `@ragenai/jobs-temporal` (the worker Dockerfile omits it): a static import
 * would fail at module resolution on every start, including the BullMQ one
 * every install now takes.
 */
registerJobRuntime('bullmq', () => new BullMqJobRuntime());

if (resolveWorkerRuntime() === 'temporal') {
  try {
    const { TemporalJobRuntime } = await import('@ragenai/jobs-temporal');
    registerJobRuntime('temporal', () => new TemporalJobRuntime());
  } catch (error) {
    // The one failure this arrangement can produce, named rather than left as
    // a bare MODULE_NOT_FOUND from a path nobody recognises. An install that
    // wants durable execution builds the image with the adapter — see ADR-44
    // and the worker Dockerfile.
    throw new Error(
      'WORKER_RUNTIME=temporal, but this build does not include ' +
        '@ragenai/jobs-temporal, so the schedule scripts have no producer. ' +
        'The published worker image ships the BullMQ runtime only (ADR-44). ' +
        `The import failed with: ${String(error)}`,
    );
  }
}

export function jobs(): JobRuntime {
  return getJobRuntime();
}
