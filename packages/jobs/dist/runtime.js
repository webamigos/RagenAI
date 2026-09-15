'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.resolveWorkerRuntime = resolveWorkerRuntime;
exports.registerJobRuntime = registerJobRuntime;
exports.clearJobRuntimeRegistry = clearJobRuntimeRegistry;
exports.getJobRuntime = getJobRuntime;
const KNOWN = ['temporal', 'bullmq'];
function resolveWorkerRuntime(env = process.env) {
  const raw = env.WORKER_RUNTIME?.trim();
  if (!raw) {
    return 'temporal';
  }
  if (!KNOWN.includes(raw)) {
    throw new Error(
      `WORKER_RUNTIME="${raw}" is not a runtime this build knows — expected one of ${KNOWN.join(', ')}`,
    );
  }
  return raw;
}
const registry = new Map();
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
function registerJobRuntime(runtime, factory) {
  registry.set(runtime, factory);
}
/** Test seam. Not exported from the package barrel on purpose. */
function clearJobRuntimeRegistry() {
  registry.clear();
  cached = undefined;
}
let cached;
/**
 * The runtime this process should use, built once.
 *
 * Throws with the runtime's name when nothing registered an adapter for it,
 * rather than returning a no-op: a producer whose jobs silently go nowhere is
 * the failure mode this whole seam exists to make impossible, and it would
 * look exactly like a worker that is merely slow.
 */
function getJobRuntime(env = process.env) {
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
//# sourceMappingURL=runtime.js.map
