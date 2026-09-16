import {
  getJobRuntime,
  registerJobRuntime,
  type JobRuntime,
} from '@ragenai/jobs';
import { BullMqJobRuntime } from '@ragenai/jobs-bullmq';
import { TemporalJobRuntime } from '@ragenai/jobs-temporal';

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
 * Both adapters are registered and the variable picks one at call time.
 * Neither constructor opens a connection, so the one this deployment does not
 * use costs a module import and nothing else.
 */
registerJobRuntime('temporal', () => new TemporalJobRuntime());
registerJobRuntime('bullmq', () => new BullMqJobRuntime());

export function jobs(): JobRuntime {
  return getJobRuntime();
}
