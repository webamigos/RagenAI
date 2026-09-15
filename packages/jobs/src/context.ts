import type { StepOptions } from './retry';

/**
 * What a handler is given besides its payload.
 *
 * Generic over the activity set on purpose. The handlers live in `apps/worker`
 * beside the activities they call, so `ctx.steps<typeof activities>({...})`
 * type-checks there with no declaration here — this package never names an
 * activity, and therefore never resolves types from an app. The spec's §2 has
 * the alternative that was rejected and why.
 */
export interface JobContext {
  /**
   * The activities, wrapped in this step's retry and timeout policy.
   *
   * On Temporal this *is* `proxyActivities`. On BullMQ it is the same
   * functions behind an in-process retry loop reading the same numbers.
   */
  steps<A>(options: StepOptions): A;

  log: JobLogger;

  /**
   * Publish a coarse progress marker.
   *
   * Temporal exposes it through the state query a caller polls before deciding
   * whether cancelling is still worth it; BullMQ has `job.updateProgress`. A
   * handler should not know which, and neither should have to be the reason a
   * pipeline reports where it is.
   */
  progress(stage: string): void;

  /**
   * Whether this run has been cancelled, re-read at each checkpoint.
   *
   * A database read rather than an engine signal, so both runtimes answer it
   * the same way and a cancelled run stops at the same points under either.
   */
  checkCancelled(): Promise<boolean>;
}

export interface JobLogger {
  debug(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
}

/**
 * A failure a handler raises itself.
 *
 * `nonRetryable` is the distinction that has to survive the port: an
 * unsupported file type must not be retried five times, and each engine spells
 * that differently — `ApplicationFailure.nonRetryable` on one side,
 * `UnrecoverableError` on the other. Handlers throw this and the adapters
 * translate, so a handler never imports an engine's error class.
 */
export class JobFailure extends Error {
  readonly retryable: boolean;
  readonly type: string | undefined;

  constructor(
    message: string,
    options?: { retryable?: boolean; type?: string; cause?: unknown },
  ) {
    super(
      message,
      options?.cause === undefined ? undefined : { cause: options.cause },
    );
    this.name = 'JobFailure';
    this.retryable = options?.retryable ?? true;
    this.type = options?.type;
  }

  static nonRetryable(
    message: string,
    options?: { type?: string; cause?: unknown },
  ): JobFailure {
    return new JobFailure(message, { ...options, retryable: false });
  }
}
