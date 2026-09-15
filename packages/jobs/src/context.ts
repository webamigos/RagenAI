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
   * This run's id — the one a producer supplied and wrote to
   * `UserFile.workflowId`.
   *
   * `scrapeWebsite` needs it: it creates its own file row, so it is the one
   * place that can persist the id a later cancel will look the run up by. It
   * read `workflowInfo().workflowId` before, which is an engine API; both
   * adapters have the same value under a different name.
   */
  readonly runId: string;

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
   * The spec's §4 has the rest of the reasoning; the short version is that
   * BullMQ has no signals, and inventing a Redis-only equivalent would give
   * the two runtimes two different cancellation mechanisms.
   *
   * **It takes the subject rather than deriving it from `runId`.** The run id
   * is in `user_files.workflow_id`, which has no index, and a checkpoint runs
   * about five times per ingest — a sequential scan each time. `(id,
   * organization_id)` is the table's unique key, so the caller passes what it
   * already has and the read stays one indexed lookup. The spec's data-model
   * section says "no migration, deliberately", and this is what keeps that
   * true.
   */
  checkCancelled(subject: CancellationSubject): Promise<boolean>;
}

/**
 * Which ingest a checkpoint is asking about.
 *
 * Both fields, always: the organization is half of the key being looked up, so
 * it cannot be dropped by editing a `where` clause later — the same reason
 * `getUserFile` uses `findUnique` on `id_organizationId` rather than
 * `findFirst` with two filters.
 */
export interface CancellationSubject {
  readonly fileId: string;
  readonly orgId: string;
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
