/**
 * Telling "this build was made without the optional runtime" apart from "that
 * runtime is broken".
 *
 * Deliberately in `utils/`, with no engine import of its own. `worker.ts` and
 * `jobs.ts` are on the path every BullMQ start takes, so a helper they call
 * cannot be the module that imports `@temporalio/*` — which is exactly the
 * mistake the first draft of this made, putting these beside
 * `temporal-failure.ts`'s `ApplicationFailure` import and quietly undoing the
 * split the image depends on.
 */

/**
 * A module-resolution failure naming a package this build leaves out.
 *
 * Two of them, for two reasons: `@temporalio/*` are devDependencies the
 * production install omits, and `@ragenai/jobs-temporal` is not in this
 * repository at all since G3 — it is in `webamigos/ragen-enterprise`. Both are
 * "this build was made without durable execution" rather than a defect.
 *
 * Narrow on purpose. The dynamic imports that make the Temporal runtime
 * optional would otherwise turn *any* failure inside those modules — a
 * TypeError at module scope, a bad env read — into "this build has no
 * Temporal", which is a confident wrong diagnosis and worse than the original
 * stack.
 */
export function isMissingTemporalPackage(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const code = (error as Error & { code?: unknown }).code;
  if (code !== 'ERR_MODULE_NOT_FOUND' && code !== 'MODULE_NOT_FOUND') {
    return false;
  }

  return /@temporalio\/|@ragenai\/jobs-temporal/.test(error.message);
}

/**
 * `new Error(message, { cause })` in a form this app can compile.
 *
 * `apps/worker` targets `lib: ES2021`, where the two-argument constructor is
 * not declared — Node has supported `cause` since 16.9, so the property is
 * real at runtime and only the type is missing. Losing it would leave whoever
 * hits this holding a sentence instead of a stack.
 */
export function withCause(error: Error, cause: unknown): Error {
  (error as Error & { cause?: unknown }).cause = cause;
  return error;
}
