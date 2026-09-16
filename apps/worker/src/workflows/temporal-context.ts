import { log, proxyActivities, workflowInfo } from '@temporalio/workflow';
import type {
  CancellationSubject,
  JobContext,
  JobLogger,
  StepOptions,
} from '@ragenai/jobs';

import { asApplicationFailure } from '../temporal-failure.js';

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
/**
 * The cancellation read, as a Temporal activity.
 *
 * It has to be one: a workflow runs in a sandbox with no I/O, so the handler's
 * `ctx.checkCancelled()` cannot touch the database from here. On BullMQ the
 * same context will call the query directly.
 *
 * Its own retry policy, short and separate from any handler's. A checkpoint is
 * a fast indexed read that should not hold a pipeline up, and it must not
 * inherit the ten-minute timeout a parse step runs under — but nor should one
 * blip cancel nothing: two attempts, then the answer is "not cancelled" and
 * the pipeline continues, which is the safe direction. Refusing to continue
 * because a status read failed would turn a database hiccup into a failed
 * ingest.
 */
const { isIngestCancelled } = proxyActivities<{
  isIngestCancelled(subject: CancellationSubject): Promise<boolean>;
}>({
  startToCloseTimeout: '20 seconds',
  retry: { maximumAttempts: 2 },
});

const temporalLogger: JobLogger = {
  debug: (message, meta) => log.debug(message, meta),
  info: (message, meta) => log.info(message, meta),
  warn: (message, meta) => log.warn(message, meta),
  error: (message, meta) => log.error(message, meta),
};

export function temporalContext(): JobContext {
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
    // Was a signal-set boolean in workflow memory. It is the row now, which is
    // what lets the cancel command flip the UI immediately instead of at the
    // next checkpoint, and what makes a cancel arriving after the engine has
    // forgotten the run a no-op rather than a `WorkflowNotFoundError`.
    checkCancelled: async (subject: CancellationSubject): Promise<boolean> => {
      try {
        return await isIngestCancelled(subject);
      } catch (error) {
        // Both attempts failed. Answering "not cancelled" is the deliberate
        // direction: the alternative is throwing out of a checkpoint, which
        // the handler's catch blocks would record as a FAILED ingest — a
        // database blip would then destroy work that was going fine. A
        // cancellation that misses this checkpoint is caught by the next one,
        // and the row it reads does not go away.
        log.warn('cancellation checkpoint could not read the file status', {
          ...subject,
          error: String(error),
        });
        return false;
      }
    },
    // Temporal has no progress primitive a workflow can publish outside a
    // query, and the query went with the signal — nothing polled it. A log
    // line is what is left, and it is replay-aware because `log` is the
    // workflow logger. BullMQ has `job.updateProgress`, which is why the
    // handler still reports rather than the wrapper guessing.
    progress: (stage: string): void => {
      log.info('ingest stage', { stage });
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
): Promise<R> {
  try {
    return await handler(payload, temporalContext());
  } catch (error) {
    throw asApplicationFailure(error);
  }
}
