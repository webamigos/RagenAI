import {
  getJobRuntime,
  registerJobRuntime,
  resolveWorkerRuntime,
  TEMPORAL_ADAPTER_PACKAGE,
  type JobRuntime,
  type TemporalAdapterModule,
} from '@ragenai/jobs';
import { BullMqJobRuntime } from '@ragenai/jobs-bullmq';

import {
  isMissingTemporalPackage,
  withCause,
} from './utils/missing-package.js';

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
 * **This is the only application that can load the Temporal adapter at all**,
 * which is the difference from `apps/web` and `apps/api`. Both of those
 * register BullMQ and nothing else since G3: a Next or Nest build traces static
 * imports, so they cannot reach a package that is not in the tree, and a
 * Temporal deployment adds it back to those two itself — see
 * `ragen-enterprise`'s `docs/durable-execution.md`. This app is plain Node and
 * has the dynamic import that makes the enterprise worker image work.
 *
 * `@ragenai/jobs-temporal` is not a dependency of this workspace since G3; it
 * lives in `webamigos/ragen-enterprise`, and an image that wants it layers it
 * in. The specifier therefore comes from the seam as a constant rather than
 * being written here as a literal — TypeScript resolves a literal at compile
 * time whichever branch guards it, so this file would not build on a default
 * install.
 */
registerJobRuntime('bullmq', () => new BullMqJobRuntime());

if (resolveWorkerRuntime() === 'temporal') {
  try {
    const { TemporalJobRuntime } = (await import(
      TEMPORAL_ADAPTER_PACKAGE
    )) as TemporalAdapterModule;
    registerJobRuntime('temporal', () => new TemporalJobRuntime());
  } catch (error) {
    // Only a missing package is the case this build deliberately creates;
    // anything else is a real failure inside the adapter and keeps its own
    // stack rather than being relabelled.
    if (!isMissingTemporalPackage(error)) {
      throw error;
    }

    throw withCause(
      new Error(
        'WORKER_RUNTIME=temporal, but this build does not include ' +
          '@ragenai/jobs-temporal, so the schedule scripts have no producer. ' +
          'That package is not part of Ragen since ADR-44 and the ' +
          "worker-runtime spec's G3 — it is in webamigos/ragen-enterprise, " +
          'whose Dockerfile layers it and the Temporal SDK onto this image. ' +
          'Run that image instead of this one.',
      ),
      error,
    );
  }
}

export function jobs(): JobRuntime {
  return getJobRuntime();
}
