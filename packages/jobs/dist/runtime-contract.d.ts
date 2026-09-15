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
   * Stop a run that has not started yet.
   *
   * Cancellation of a *running* job is a database fact rather than an engine
   * signal — see the spec's §4 — so this covers only the part the engine owns:
   * a job still waiting in the queue should never start.
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
export interface JobSchedule {
  /** Stable across runs — re-registering the same id must not create a second. */
  id: string;
  job: JobName;
  /** Standard five-field cron. */
  cron: string;
  timezone: string;
}
//# sourceMappingURL=runtime-contract.d.ts.map
