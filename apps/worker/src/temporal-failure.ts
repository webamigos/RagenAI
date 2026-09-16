import { ApplicationFailure } from '@temporalio/common';

/**
 * Translate a seam failure into Temporal's, wherever the boundary is.
 *
 * A handler — and an activity — throws `JobFailure` and never imports an
 * engine's error class, so something has to map `retryable: false` onto
 * `ApplicationFailure.nonRetryable`, and preserve `type`, which the ingest
 * workflows' catch blocks use to tell an already-recorded cancellation apart
 * from every other failure.
 *
 * It lives here rather than in `workflows/temporal-context.ts`, where it
 * started, because there are two boundaries and only one of them is a
 * workflow: `temporal-runtime.ts` wraps the activity functions with it too.
 * That file runs in the activity worker, and importing the workflow module
 * from there would load a sandbox API outside its sandbox.
 * `@temporalio/common` is where the class actually comes from —
 * `@temporalio/workflow` re-exports it — so both sides get the same one.
 */
export function asApplicationFailure(
  error: unknown,
): ApplicationFailure | unknown {
  if (
    error instanceof Error &&
    error.name === 'JobFailure' &&
    'retryable' in error
  ) {
    const failure = error as Error & { retryable: boolean; type?: string };
    return failure.retryable
      ? ApplicationFailure.create({
          message: failure.message,
          type: failure.type,
        })
      : ApplicationFailure.nonRetryable(failure.message, failure.type);
  }

  return error;
}

type Activity = (...args: never[]) => Promise<unknown>;

/**
 * The other end of the translation `runOnTemporal` does for workflows.
 *
 * An activity throws `JobFailure` like everything else behind the seam, and
 * Temporal cannot read it: a plain `Error` out of an activity is *retryable*,
 * so `JobFailure.nonRetryable('Invalid crawl mode')` would be retried five
 * times under the activity's own policy before failing anyway. Only
 * `ApplicationFailure.nonRetryable` says otherwise — and an activity that
 * imported that class would put an engine's error into code that runs on both
 * engines, which is what kept `@temporalio/workflow` in an image that never
 * runs Temporal.
 *
 * Applied in `temporal-runtime.ts`, the only file that knows this process is
 * running on Temporal. One `try` per activity call.
 */
export function translatingFailures<T extends Record<string, unknown>>(
  source: T,
): T {
  return Object.fromEntries(
    Object.entries(source).map(([name, activity]) => [
      name,
      async (...args: never[]) => {
        try {
          return await (activity as Activity)(...args);
        } catch (error) {
          throw asApplicationFailure(error);
        }
      },
    ]),
  ) as T;
}
