import type { JobName, JobPayloads, JobResults } from './contract';

/**
 * The producer side: everything the nineteen call sites in `apps/web` and
 * `apps/api` do to a background job.
 *
 * Deliberately small. Every method here is something a call site already does
 * today through `@temporalio/client`; nothing was added in anticipation.
 */
export interface JobRuntime {
  /**
   * Enqueue a job under a caller-supplied run id.
   *
   * The id is the caller's because it is already written to `UserFile.workflowId`
   * before the job is started, and a cancel has to be able to find the run
   * again from the row.
   */
  start<N extends JobName>(
    job: N,
    runId: string,
    payload: JobPayloads[N],
  ): Promise<void>;

  /** Status and result, for the document-generation polling route. */
  getRun(runId: string): Promise<JobRun>;

  /**
   * Stop a run the worker has not picked up yet, and only that.
   *
   * Cancellation of a *running* job is a database fact rather than an engine
   * instruction — see the spec's §4 — so this covers the part the engine owns
   * and nothing more: a job still waiting should never start. An adapter that
   * went further and ended a running job would take away the status write the
   * pipeline makes when it reads that fact at its next checkpoint, and the
   * file would sit in PROCESSING for good.
   */
  requestCancel(runId: string): Promise<void>;

  upsertSchedule(schedule: JobSchedule): Promise<void>;
  deleteSchedule(id: string): Promise<void>;
}

/**
 * What a run looks like from outside.
 *
 * `unknown` is a real state, not a fallback: both engines forget completed
 * runs eventually, and the route that polls this answers 404 for an id it can
 * no longer describe. Collapsing it into `failed` would turn "you polled too
 * late" into "your document failed".
 */
export type JobRunStatus =
  'running' | 'completed' | 'failed' | 'cancelled' | 'unknown';

export interface JobRun {
  status: JobRunStatus;
  result?: JobResults[JobName];
  failure?: string;
}

/**
 * The jobs a schedule can name: the ones that take no payload.
 *
 * A schedule supplies no arguments — there is no producer to build them — so
 * an adapter starts a scheduled run with an empty argument list. Pointing a
 * schedule at `runFileEmbeddings` would therefore start it with `undefined`
 * where a `UserFile` is expected, and the first property read would fail
 * nightly, in a worker, with no user watching. The type forbids it instead.
 */
export type ScheduledJobName = {
  [K in JobName]: JobPayloads[K] extends void ? K : never;
}[JobName];

export interface JobSchedule {
  /** Stable across runs — re-registering the same id must not create a second. */
  id: string;
  job: ScheduledJobName;
  /** Standard five-field cron. */
  cron: string;
  timezone: string;
}
