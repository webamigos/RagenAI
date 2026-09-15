import {
  Client,
  Connection,
  ScheduleOverlapPolicy,
  type ScheduleHandle,
} from '@temporalio/client';
import type {
  JobName,
  JobPayloads,
  JobRun,
  JobRunStatus,
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

export const TASK_QUEUE_NAME = 'ragen-tasks';

export interface TemporalJobRuntimeOptions {
  address?: string;
  namespace?: string;
  taskQueue?: string;
  /** Injectable for tests; the default builds a lazily-connecting client. */
  client?: Client;
}

/**
 * Temporal's status names, in the seam's vocabulary.
 *
 * `TERMINATED` and `TIMED_OUT` map to `failed` rather than to a state of their
 * own, because the one route that reads this already treats them that way and
 * a new state would change an API response. `CONTINUED_AS_NEW` maps to
 * `running`: no workflow here uses it, and if one ever does, "still going" is
 * the honest answer.
 */
const STATUS: Record<string, JobRunStatus> = {
  RUNNING: 'running',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
  CANCELED: 'cancelled',
  TERMINATED: 'failed',
  TIMED_OUT: 'failed',
  CONTINUED_AS_NEW: 'running',
};

const isNotFound = (error: unknown): boolean =>
  error instanceof Error && error.name === 'WorkflowNotFoundError';

export class TemporalJobRuntime implements JobRuntime {
  private readonly taskQueue: string;
  private readonly clientFactory: () => Client;
  private client: Client | undefined;

  constructor(options: TemporalJobRuntimeOptions = {}) {
    this.taskQueue = options.taskQueue ?? TASK_QUEUE_NAME;
    this.clientFactory = options.client
      ? (): Client => options.client!
      : (): Client =>
          new Client({
            // Lazy on purpose: constructing a runtime must not open a socket,
            // because a producer builds one per request path and a Temporal
            // that is briefly unreachable should fail the start call rather
            // than the module load.
            connection: Connection.lazy({
              address:
                options.address ??
                process.env.TEMPORAL_SERVER_ADDRESS ??
                'localhost:7233',
            }),
            ...(options.namespace ? { namespace: options.namespace } : {}),
          });
  }

  private get temporal(): Client {
    this.client ??= this.clientFactory();
    return this.client;
  }

  async start<N extends JobName>(
    job: N,
    runId: string,
    payload: JobPayloads[N],
  ): Promise<void> {
    // Started by *name*, which is this repository's convention and the reason
    // the cast is here rather than a type error: Temporal's `start` is generic
    // over a workflow function, so it derives the argument tuple from a type
    // the producer deliberately does not import. The name and payload are
    // checked by `JobRuntime` one line above instead.
    await this.temporal.workflow.start(
      job as string,
      {
        taskQueue: this.taskQueue,
        workflowId: runId,
        // A void payload is a scheduled job started by hand; Temporal takes an
        // empty argument list rather than `[undefined]`, which a workflow
        // expecting no arguments would otherwise receive as one.
        args: payload === undefined ? [] : [payload],
      } as Parameters<Client['workflow']['start']>[1],
    );
  }

  async getRun(runId: string): Promise<JobRun> {
    const handle = this.temporal.workflow.getHandle(runId);

    let status: JobRunStatus;
    try {
      const description = await handle.describe();
      status = STATUS[description.status.name] ?? 'unknown';
    } catch (error) {
      if (isNotFound(error)) {
        return { status: 'unknown' };
      }
      throw error;
    }

    if (status !== 'completed') {
      return { status };
    }

    // Only read the result once the run completed: `result()` on a failed run
    // throws the workflow's own failure, and the caller asked for a status.
    return { status, result: (await handle.result()) as JobRun['result'] };
  }

  async requestCancel(runId: string): Promise<void> {
    try {
      await this.temporal.workflow.getHandle(runId).cancel();
    } catch (error) {
      // A run the engine has forgotten is not an error to the caller: the
      // status it wanted to stop is written in the database either way, and
      // cancelling an aged-out workflow used to throw exactly here.
      if (!isNotFound(error)) {
        throw error;
      }
    }
  }

  async upsertSchedule(schedule: JobSchedule): Promise<void> {
    const spec = {
      cronExpressions: [schedule.cron],
      timezone: schedule.timezone,
    };

    const handle: ScheduleHandle = this.temporal.schedule.getHandle(
      schedule.id,
    );

    try {
      await handle.update((current) => ({
        ...current,
        spec,
      }));
      return;
    } catch (error) {
      if (!(error instanceof Error && error.name === 'ScheduleNotFoundError')) {
        throw error;
      }
    }

    await this.temporal.schedule.create({
      scheduleId: schedule.id,
      spec,
      action: {
        type: 'startWorkflow',
        workflowType: schedule.job,
        taskQueue: this.taskQueue,
        args: [],
      },
      // The same policy the two schedule scripts set today: a nightly job still
      // running when the next fire arrives should skip it, not queue a second
      // copy behind it. BullMQ has no equivalent, which is why the spec gives
      // the maintenance queue a global concurrency of 1 and a per-day job id.
      policies: { overlap: ScheduleOverlapPolicy.SKIP },
    });
  }

  async deleteSchedule(id: string): Promise<void> {
    try {
      await this.temporal.schedule.getHandle(id).delete();
    } catch (error) {
      if (!(error instanceof Error && error.name === 'ScheduleNotFoundError')) {
        throw error;
      }
    }
  }
}
