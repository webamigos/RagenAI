import { Client } from '@temporalio/client';
import type {
  JobName,
  JobPayloads,
  JobRun,
  JobRuntime,
  JobSchedule,
} from '@ragenai/jobs';
/**
 * The Temporal adapter, and the only package in this repository that imports
 * `@temporalio/*`.
 *
 * That is the point of it existing separately from `@ragenai/jobs`: the guard
 * in `tests/architecture/jobs-seam-is-the-only-runtime-import.test.ts` can then
 * be one line, and the spec's Phase G extraction is a `git mv` rather than an
 * archaeology exercise. Nothing here is new behaviour — every call is what a
 * producer in `apps/web` or `apps/api` already made directly.
 */
export declare const TASK_QUEUE_NAME = 'ragen-tasks';
export interface TemporalJobRuntimeOptions {
  address?: string;
  namespace?: string;
  taskQueue?: string;
  /** Injectable for tests; the default builds a lazily-connecting client. */
  client?: Client;
}
export declare class TemporalJobRuntime implements JobRuntime {
  private readonly taskQueue;
  private readonly clientFactory;
  private client;
  constructor(options?: TemporalJobRuntimeOptions);
  private get temporal();
  start<N extends JobName>(
    job: N,
    runId: string,
    payload: JobPayloads[N],
  ): Promise<void>;
  getRun(runId: string): Promise<JobRun>;
  requestCancel(runId: string): Promise<void>;
  upsertSchedule(schedule: JobSchedule): Promise<void>;
  deleteSchedule(id: string): Promise<void>;
}
//# sourceMappingURL=index.d.ts.map
