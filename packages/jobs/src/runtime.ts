import type { JobRuntime } from './runtime-contract';

/**
 * Which engine runs the jobs.
 *
 * `temporal` is the only value Phase A accepts; `bullmq` arrives with its
 * adapter in Phase C. The variable exists from the first commit so that every
 * consumer reads the seam rather than a client, which is what makes the later
 * switch a configuration change instead of a refactor.
 */
export type WorkerRuntime = 'temporal' | 'bullmq';

const KNOWN: readonly WorkerRuntime[] = ['temporal', 'bullmq'];

export function resolveWorkerRuntime(
  env: Record<string, string | undefined> = process.env,
): WorkerRuntime {
  const raw = env.WORKER_RUNTIME?.trim();
  if (!raw) {
    return 'temporal';
  }
  if (!KNOWN.includes(raw as WorkerRuntime)) {
    throw new Error(
      `WORKER_RUNTIME="${raw}" is not a runtime this build knows — expected one of ${KNOWN.join(', ')}`,
    );
  }
  return raw as WorkerRuntime;
}

type Factory = () => JobRuntime;

const registry = new Map<WorkerRuntime, Factory>();

/**
 * Tell the seam how to build a runtime.
 *
 * An app registers the adapters it ships with, at its own entry point, with a
 * plain import — which is what keeps this bundler-safe: `apps/web` is a Next
 * build, and a package reaching for an adapter through a computed specifier is
 * exactly the shape that does not get traced into a server bundle.
 *
 * Registration is also what lets an adapter live outside this repository
 * later without the seam naming it (the spec's Phase G): the worker image
 * registers whatever it was built with, and this package stays ignorant of
 * both.
 */
export function registerJobRuntime(
  runtime: WorkerRuntime,
  factory: Factory,
): void {
  registry.set(runtime, factory);
}

/** Test seam. Not exported from the package barrel on purpose. */
export function clearJobRuntimeRegistry(): void {
  registry.clear();
  cached = undefined;
}

let cached: JobRuntime | undefined;

/**
 * The runtime this process should use, built once.
 *
 * Throws with the runtime's name when nothing registered an adapter for it,
 * rather than returning a no-op: a producer whose jobs silently go nowhere is
 * the failure mode this whole seam exists to make impossible, and it would
 * look exactly like a worker that is merely slow.
 */
export function getJobRuntime(
  env: Record<string, string | undefined> = process.env,
): JobRuntime {
  if (cached) {
    return cached;
  }

  const runtime = resolveWorkerRuntime(env);
  const factory = registry.get(runtime);

  if (!factory) {
    throw new Error(
      `no adapter registered for WORKER_RUNTIME="${runtime}". ` +
        'An application registers one at its entry point with registerJobRuntime(); ' +
        'if this is a deployment that added a runtime, check that its bootstrap is imported.',
    );
  }

  cached = factory();
  return cached;
}
