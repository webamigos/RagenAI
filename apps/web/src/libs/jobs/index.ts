import {
  getJobRuntime,
  registerJobRuntime,
  type JobRuntime,
} from '@ragenai/jobs';
import { BullMqJobRuntime } from '@ragenai/jobs-bullmq';
import { TemporalJobRuntime } from '@ragenai/jobs-temporal';

/**
 * The job runtime, as `apps/web` sees it.
 *
 * Importing this module registers the adapters this application ships with,
 * which is why every producer goes through `jobs()` rather than calling
 * `getJobRuntime()` itself: registration is a module side effect, and a call
 * site that resolved the runtime without importing this file would get the
 * seam's "no adapter registered" error instead of a client.
 *
 * Registration rather than a dynamic import is what keeps this bundler-safe —
 * a package reaching for an adapter through a computed specifier is exactly
 * the shape Next does not trace into a server bundle. See the worker-runtime
 * spec's §1.
 *
 * The address is deliberately not passed. `TemporalJobRuntime` reads
 * `TEMPORAL_SERVER_ADDRESS` and falls back to `localhost:7233`; the constant
 * this file could have handed it is
 * `` `${process.env.TEMPORAL_SERVER_ADDRESS}` || 'localhost:7233' ``, whose
 * template literal is never empty — so with the variable unset it produced the
 * string `"undefined"` and the fallback never ran. The adapter's own default
 * is the one the worker has always used.
 */
registerJobRuntime('temporal', () => new TemporalJobRuntime());
/**
 * Both adapters are registered, and `WORKER_RUNTIME` picks between them at
 * call time. Registering the one this deployment does not use costs a module
 * import and nothing else — neither constructor opens a connection, and only
 * the selected factory is ever called.
 */
registerJobRuntime('bullmq', () => new BullMqJobRuntime());

export function jobs(): JobRuntime {
  return getJobRuntime();
}
