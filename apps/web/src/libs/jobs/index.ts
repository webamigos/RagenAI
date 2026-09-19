import {
  getJobRuntime,
  registerJobRuntime,
  type JobRuntime,
} from '@ragenai/jobs';
import { BullMqJobRuntime } from '@ragenai/jobs-bullmq';

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
 * **BullMQ is the only adapter here, since the spec's G3.**
 * `@ragenai/jobs-temporal` moved to
 * [`webamigos/ragen-enterprise`](https://github.com/webamigos/ragen-enterprise),
 * and this application cannot reach it the way `apps/worker` does. The worker
 * is plain Node and loads the adapter through a dynamic import; a Next build
 * traces static imports and resolves them at build time, so a package that is
 * not in the tree cannot be traced — and one that survived tracing would still
 * have to be copied into the standalone output, on a path no test and no
 * deployment here would exercise.
 *
 * So the published image is a BullMQ producer, which is what ADR-44 makes the
 * default. **A deployment running `WORKER_RUNTIME=temporal` builds this
 * application itself**, adding `@ragenai/jobs-temporal` to this workspace's
 * dependencies and one line beside the registration below:
 *
 *     registerJobRuntime('temporal', () => new TemporalJobRuntime());
 *
 * Two lines, written down rather than made to look automatic —
 * `ragen-enterprise`'s `docs/durable-execution.md` has the procedure. Without
 * them `jobs()` throws the seam's *no adapter registered for
 * WORKER_RUNTIME="temporal"* on the first enqueue, which is the loud failure
 * the seam exists to give instead of a queue nobody reads.
 *
 * The address is deliberately not passed to that constructor either.
 * `TemporalJobRuntime` reads `TEMPORAL_SERVER_ADDRESS` and falls back to
 * `localhost:7233`; the constant this file used to hand it was
 * `` `${process.env.TEMPORAL_SERVER_ADDRESS}` || 'localhost:7233' ``, whose
 * template literal is never empty — so with the variable unset it produced the
 * string `"undefined"` and the fallback never ran.
 */
registerJobRuntime('bullmq', () => new BullMqJobRuntime());

export function jobs(): JobRuntime {
  return getJobRuntime();
}
