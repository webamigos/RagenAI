import { log, proxyActivities, workflowInfo } from '@temporalio/workflow';
import { ApplicationFailure } from '@temporalio/common';
import type { JobContext, JobLogger, StepOptions } from '@ragenai/jobs';

import type { EmbeddingStage } from './signals.js';

/**
 * A `JobContext` backed by Temporal, built inside the workflow sandbox.
 *
 * This is the whole adapter on the consuming side: `ctx.steps` *is*
 * `proxyActivities`, so a handler's retry policy reaches the engine byte for
 * byte, and `ctx.log` is the workflow logger, which is replay-aware in a way a
 * plain Pino call is not. The handlers know none of that — they take a
 * `JobContext` and would run against a BullMQ one unchanged, which is the
 * point of the seam.
 */
export interface TemporalContextOptions {
  /** Reads the cooperative cancel flag the signal handler sets. */
  isCancelled?: () => boolean;
  /** Publishes the coarse stage the state query reports. */
  onProgress?: (stage: EmbeddingStage) => void;
}

const temporalLogger: JobLogger = {
  debug: (message, meta) => log.debug(message, meta),
  info: (message, meta) => log.info(message, meta),
  warn: (message, meta) => log.warn(message, meta),
  error: (message, meta) => log.error(message, meta),
};

export function temporalContext(
  options: TemporalContextOptions = {},
): JobContext {
  return {
    runId: workflowInfo().workflowId,
    // The cast is the seam's one concession to Temporal's types:
    // `proxyActivities` is generic over an activity *record* and takes its own
    // options type, while `StepOptions` is the runtime-neutral shape both
    // adapters read. The values are identical — Temporal's duration strings
    // are what `StepOptions` was modelled on — so this converts a type, not a
    // meaning.
    steps: <A>(stepOptions: StepOptions): A =>
      proxyActivities(
        stepOptions as unknown as Parameters<typeof proxyActivities>[0],
      ) as unknown as A,
    log: temporalLogger,
    checkCancelled: async (): Promise<boolean> =>
      options.isCancelled?.() ?? false,
    progress: (stage: string): void => {
      options.onProgress?.(stage as EmbeddingStage);
    },
  };
}

/**
 * Run a handler as a Temporal workflow.
 *
 * The translation is not a nicety. A workflow that throws something Temporal
 * does not recognise fails the *workflow task* rather than the workflow, and
 * Temporal retries a failed task forever — so a handler throwing a plain
 * `JobFailure` turns a test that expects a failed run into one that hangs, and
 * a production ingest into a hot loop. Two of the worker's own workflow tests
 * caught exactly that during the port.
 */
export async function runOnTemporal<P, R>(
  handler: (payload: P, ctx: JobContext) => Promise<R>,
  payload: P,
  options: TemporalContextOptions = {},
): Promise<R> {
  try {
    return await handler(payload, temporalContext(options));
  } catch (error) {
    throw asApplicationFailure(error);
  }
}

/**
 * Translate a handler's failure into the engine's.
 *
 * A handler throws `JobFailure` and never imports an engine's error class, so
 * something has to map `retryable: false` onto
 * `ApplicationFailure.nonRetryable` — and preserve `type`, which the ingest
 * workflows' catch blocks use to tell an already-recorded cancellation apart
 * from every other failure.
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
