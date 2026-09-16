import type { Job } from 'bullmq';
import {
  backoffMs,
  durationMs,
  type CancellationSubject,
  type JobContext,
  type JobLogger,
  type StepOptions,
} from '@ragenai/jobs';

/**
 * What the handlers' `ctx` is on this runtime.
 *
 * Temporal gave them `proxyActivities`, which turns every call into a durable
 * activity with the engine enforcing the retry policy and the timeout. BullMQ
 * has no such concept — a job is one function call — so the policy the
 * handlers already declare is enforced here instead, from the same numbers.
 * That is the point of `StepOptions` being runtime-neutral: a step that
 * retried three times over five minutes under one engine and once under the
 * other would be a behaviour change disguised as a port.
 */

/**
 * Attempts to make when a policy does not say.
 *
 * Temporal's answer is "forever", and that is the one thing this cannot
 * reproduce honestly: an unbounded in-process loop is a job that never
 * finishes and never fails, holding its lock and renewing it, invisible except
 * as a worker that seems busy. A finite cap is the safer disagreement.
 *
 * It should never apply. Every `ctx.steps` call in this repository names
 * `maximumAttempts`, and `every-step-policy-names-its-attempts.test.ts` fails
 * if one stops — so this is a floor under a mistake, not a default anyone
 * relies on.
 */
export const DEFAULT_MAX_ATTEMPTS = 5;

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/** A handler's own "do not retry this", without importing the engine's. */
const isNonRetryable = (error: unknown): boolean =>
  error instanceof Error &&
  error.name === 'JobFailure' &&
  (error as Error & { retryable?: boolean }).retryable === false;

/**
 * One attempt, abandoned if it outlasts the step's timeout.
 *
 * The underlying call is not killed — nothing in Node can — so this stops
 * *waiting* rather than stopping the work. Temporal's `startToCloseTimeout`
 * behaves the same way for an activity that does not check for cancellation,
 * which is all of ours, so the port preserves the behaviour rather than only
 * the number.
 */
async function withTimeout<T>(
  work: Promise<T>,
  ms: number,
  step: string,
): Promise<T> {
  let timer: NodeJS.Timeout | undefined;

  try {
    return await Promise.race([
      work,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`step "${step}" exceeded ${ms}ms`)),
          ms,
        );
      }),
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

/**
 * Run one activity under the step's policy.
 *
 * Retries here rather than through BullMQ's own `attempts`, because BullMQ
 * retries the **whole job** — a failed embedding would re-download, re-parse
 * and re-chunk the document before reaching the step that failed. Temporal
 * retried the activity alone, and the handlers' policies were written for that.
 */
export async function runStep<T>(
  step: string,
  call: () => Promise<T>,
  options: StepOptions,
  log: JobLogger,
): Promise<T> {
  const attempts = options.retry.maximumAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const timeout = durationMs(options.startToCloseTimeout);

  for (let attempt = 1; ; attempt++) {
    try {
      return await withTimeout(call(), timeout, step);
    } catch (error) {
      // A deliberate stop — an unsupported file type, a cancellation the
      // pipeline already recorded. Retrying it would turn one clear failure
      // into five slow ones.
      if (isNonRetryable(error) || attempt >= attempts) {
        throw error;
      }

      const delay = backoffMs(options.retry, attempt);
      log.warn('step failed, retrying', {
        step,
        attempt,
        attempts,
        delayMs: delay,
        err: String(error),
      });
      await sleep(delay);
    }
  }
}

export interface JobContextDeps {
  /** The activity functions, by name — `apps/worker` owns them. */
  activities: Record<string, (...args: never[]) => Promise<unknown>>;
  log: JobLogger;
  /**
   * The cancellation read, injected rather than imported: it is a database
   * query, and this package has no database. On Temporal the same read is an
   * activity because a workflow sandbox has no I/O; here the handler's
   * checkpoint calls it directly.
   */
  isCancelled(subject: CancellationSubject): Promise<boolean>;
}

export function createJobContext(job: Job, deps: JobContextDeps): JobContext {
  return {
    // The producer's id, which is what `UserFile.workflowId` holds. BullMQ
    // fills `job.id` with it because `start` passes it as `jobId`.
    runId: String(job.id),

    steps: <A>(options: StepOptions): A =>
      new Proxy(
        {},
        {
          get:
            (_target, name: string) =>
            (...args: unknown[]): Promise<unknown> => {
              const activity = deps.activities[name];

              if (!activity) {
                // A handler asking for an activity the worker did not register
                // is a wiring mistake, and it must not read as that activity
                // returning undefined — which is what a bare proxy would do,
                // several steps before anything looked wrong.
                return Promise.reject(
                  new Error(
                    `no activity named "${name}" is registered with the worker`,
                  ),
                );
              }

              return runStep(
                name,
                () => activity(...(args as never[])),
                options,
                deps.log,
              );
            },
        },
      ) as A,

    log: deps.log,

    checkCancelled: (subject) => deps.isCancelled(subject),

    // Temporal had no progress primitive outside a query and settled for a log
    // line; BullMQ has the real thing, and bull-board renders it.
    progress: (stage: string): void => {
      void job.updateProgress({ stage }).catch(() => {
        // Progress is a convenience. A Redis blip while reporting it must not
        // fail a job that is otherwise fine.
      });
    },
  };
}
