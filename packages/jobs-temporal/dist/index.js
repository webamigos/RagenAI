'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.TemporalJobRuntime = exports.TASK_QUEUE_NAME = void 0;
const client_1 = require('@temporalio/client');
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
exports.TASK_QUEUE_NAME = 'ragen-tasks';
/**
 * Temporal's status names, in the seam's vocabulary.
 *
 * `TERMINATED` and `TIMED_OUT` map to `failed` rather than to a state of their
 * own, because the one route that reads this already treats them that way and
 * a new state would change an API response. `CONTINUED_AS_NEW` maps to
 * `running`: no workflow here uses it, and if one ever does, "still going" is
 * the honest answer.
 */
const STATUS = {
  RUNNING: 'running',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
  CANCELED: 'cancelled',
  TERMINATED: 'failed',
  TIMED_OUT: 'failed',
  CONTINUED_AS_NEW: 'running',
};
const isNotFound = (error) =>
  error instanceof Error && error.name === 'WorkflowNotFoundError';
class TemporalJobRuntime {
  taskQueue;
  clientFactory;
  client;
  constructor(options = {}) {
    this.taskQueue = options.taskQueue ?? exports.TASK_QUEUE_NAME;
    this.clientFactory = options.client
      ? () => options.client
      : () =>
          new client_1.Client({
            // Lazy on purpose: constructing a runtime must not open a socket,
            // because a producer builds one per request path and a Temporal
            // that is briefly unreachable should fail the start call rather
            // than the module load.
            connection: client_1.Connection.lazy({
              address:
                options.address ??
                process.env.TEMPORAL_SERVER_ADDRESS ??
                'localhost:7233',
            }),
            ...(options.namespace ? { namespace: options.namespace } : {}),
          });
  }
  get temporal() {
    this.client ??= this.clientFactory();
    return this.client;
  }
  async start(job, runId, payload) {
    // Started by *name*, which is this repository's convention and the reason
    // the cast is here rather than a type error: Temporal's `start` is generic
    // over a workflow function, so it derives the argument tuple from a type
    // the producer deliberately does not import. The name and payload are
    // checked by `JobRuntime` one line above instead.
    await this.temporal.workflow.start(job, {
      taskQueue: this.taskQueue,
      workflowId: runId,
      // A void payload is a scheduled job started by hand; Temporal takes an
      // empty argument list rather than `[undefined]`, which a workflow
      // expecting no arguments would otherwise receive as one.
      args: payload === undefined ? [] : [payload],
    });
  }
  async getRun(runId) {
    const handle = this.temporal.workflow.getHandle(runId);
    let status;
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
    return { status, result: await handle.result() };
  }
  async requestCancel(runId) {
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
  async upsertSchedule(schedule) {
    const spec = {
      cronExpressions: [schedule.cron],
      timezone: schedule.timezone,
    };
    const handle = this.temporal.schedule.getHandle(schedule.id);
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
      policies: { overlap: client_1.ScheduleOverlapPolicy.SKIP },
    });
  }
  async deleteSchedule(id) {
    try {
      await this.temporal.schedule.getHandle(id).delete();
    } catch (error) {
      if (!(error instanceof Error && error.name === 'ScheduleNotFoundError')) {
        throw error;
      }
    }
  }
}
exports.TemporalJobRuntime = TemporalJobRuntime;
//# sourceMappingURL=index.js.map
