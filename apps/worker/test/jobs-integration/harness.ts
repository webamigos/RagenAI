import { expect, type Mock } from 'vitest';

import {
  resolveWorkerRuntime,
  type JobLogger,
  type JobRun,
  type JobRunStatus,
  type JobRuntime,
  type WorkerRuntime,
} from '@ragenai/jobs';
import type { JobHandlers } from '@ragenai/jobs-bullmq';

/**
 * One runtime under test, behind the seam's own vocabulary.
 *
 * The suites below start jobs through `JobRuntime` and read them back through
 * `getRun` — never through a queue, a client or an engine's own types — so the
 * same files run against either adapter. That is not decoration: §8.3 of the
 * spec promises this suite runs against a real Temporal as well, nightly, and
 * that promise is only affordable if the assertions are already engine-free.
 *
 * **Both implementations exist now.** BullMQ is the one CI runs per pull
 * request (the spec's D1); Temporal is the nightly parity job, selected the
 * same way a deployment selects it — `WORKER_RUNTIME=temporal`. Where the two
 * genuinely differ, the difference is named in `RuntimeTraits` rather than
 * hidden behind a fallback: a parity suite that quietly tested one engine
 * twice would be worse than no parity suite, because the report would say
 * both.
 */
export interface JobRuntimeHarness {
  /** Which engine this run is exercising, for a failure message to name. */
  readonly runtimeName: WorkerRuntime;

  /** The producer side: what `apps/web` and `apps/api` hold. */
  readonly jobs: JobRuntime;

  /**
   * The activity stubs the handlers are running against, so a test can assert
   * what the pipeline did without a database.
   */
  readonly activities: Record<string, Mock>;

  /** Resolves when the run reaches a terminal state, or the deadline passes. */
  waitForRun(runId: string, timeoutMs?: number): Promise<JobRun>;

  /**
   * The schedule ids the engine currently holds.
   *
   * On the seam this is engine-specific — nothing in the application lists
   * schedules — so it belongs to the harness, which is the layer that knows
   * which engine it started. The Temporal harness answers it from the schedule
   * client.
   */
  listScheduleIds(): Promise<string[]>;

  /** Begin consuming. Called for you unless the harness was started paused. */
  startConsuming(): Promise<void>;

  /** Stop consuming without tearing the queues down, so state stays readable. */
  stopConsuming(): Promise<void>;

  close(): Promise<void>;
}

/**
 * The five places the two engines do not agree, stated once.
 *
 * A parity suite is only worth running if it can tell a *difference* from a
 * *regression*, and the way to do that is to write the differences down where
 * both runs read them — not as a skipped file on one side and an `if` in the
 * other. Every field here is a fact about an engine that the application is
 * entitled to see, so each one is also a small specification of what an
 * adapter owes the seam.
 *
 * Nothing here is a knob. Adding a field is admitting the runtimes diverge
 * somewhere new, which is exactly the conversation the nightly job exists to
 * start.
 */
export interface RuntimeTraits {
  /**
   * Does `getRun` carry the failure's message, or only its status?
   *
   * BullMQ's does, because `job.failedReason` is a field the adapter already
   * has. Temporal's does not, and deliberately: `describe()` carries the
   * status without the failure, and reading the failure means calling
   * `result()`, which *throws the workflow's own error* at a caller who asked
   * for a status. The one consumer — the document-status route — logs the
   * text and shows the user a generic message either way, so the adapter
   * declines the second round trip.
   *
   * What this costs is diagnostic, and it is worth knowing before debugging a
   * Temporal install: `failure` is always `undefined` in that log line.
   */
  readonly reportsFailureText: boolean;

  /**
   * What a run cancelled before any worker saw it reads back as.
   *
   * BullMQ removes the job from the queue, so it reads `unknown` — there is no
   * record left to describe. Temporal has no queue to remove from: a workflow
   * is RUNNING from the moment it is created, and cancelling it leaves a
   * closed, CANCELLED execution in history. Both satisfy what the seam
   * promises (`requestCancel` stops a job that has not started); they differ
   * in what remains afterwards, and the one consumer — the status route —
   * treats `unknown` and `cancelled` the same way.
   */
  readonly cancelledBeforeStart: JobRunStatus;

  /**
   * Can a test swap a handler for a stub?
   *
   * BullMQ registers a record of functions, so yes. Temporal loads workflows
   * from `workflowsPath` into a sandboxed bundle built from disk, so a closure
   * cannot reach it — which is a property of the engine, not of the adapter,
   * and the reason the stalled-job suite is BullMQ's alone.
   */
  readonly acceptsHandlerOverrides: boolean;

  /**
   * Does an unrenewed lock redeliver the job?
   *
   * The failure mode BullMQ has and Temporal does not, and the whole subject
   * of `stalled-jobs.jobs-integration.ts`. Temporal's activity heartbeats and
   * task timeouts are a different mechanism with different settings; asserting
   * BullMQ's against it would be testing a translation nobody wrote.
   */
  readonly redeliversStalledJobs: boolean;

  /**
   * A cadence of roughly two seconds, in the dialect this engine's scheduler
   * speaks.
   *
   * The production schedules are five-field and fire nightly; a suite that
   * waited for those would be measuring its own patience, so it registers a
   * fast one instead — and the fast one is where the dialects part. BullMQ's
   * parser takes a six-field cron with seconds. Temporal's takes five, and
   * **accepts a six-field string without ever firing it**: the schedule is
   * created, `listSchedules` returns it, and nothing runs — measured at zero
   * actions in sixty seconds, against thirty-three for the interval form.
   *
   * So this is not a knob for tuning the suite's speed. It is the reason a
   * naive parity run reports "Temporal does not fire schedules at all", which
   * is false, and which would have been this job's first wrong answer.
   */
  readonly everyFewSeconds: string;
}

const TRAITS: Record<WorkerRuntime, RuntimeTraits> = {
  bullmq: {
    reportsFailureText: true,
    cancelledBeforeStart: 'unknown',
    acceptsHandlerOverrides: true,
    redeliversStalledJobs: true,
    everyFewSeconds: '*/2 * * * * *',
  },
  temporal: {
    reportsFailureText: false,
    cancelledBeforeStart: 'cancelled',
    acceptsHandlerOverrides: false,
    redeliversStalledJobs: false,
    everyFewSeconds: '@every 2s',
  },
};

/** The traits of the runtime this process was told to exercise. */
export const traits = (): RuntimeTraits => TRAITS[resolveWorkerRuntime()];

/**
 * A run failed, and — where the engine carries the text — failed for the
 * stated reason.
 *
 * The status half is the parity assertion and holds on both runtimes; the text
 * half is `reportsFailureText`. Written as one call rather than an `if` at
 * three call sites so that the *reason* a suite stops checking the message is
 * one link away, instead of being re-explained each time or, worse, dropped
 * from both runs to make the file read evenly.
 */
export function expectFailedWith(run: JobRun, reason: string | RegExp): void {
  expect(run.status, `expected a failed run, got ${run.status}`).toBe('failed');

  if (traits().reportsFailureText) {
    expect(run.failure).toMatch(reason);
  }
}

export interface HarnessOptions {
  /** Defaults to a fresh `createMockActivities()`. */
  activities?: Record<string, Mock>;
  /**
   * Start the workers, or leave the jobs queued.
   *
   * `false` is how the cancellation suite reaches the only state
   * `requestCancel` acts on — a job the worker has not picked up.
   */
  consume?: boolean;
  concurrency?: number;
  /** Test-only, and BullMQ-only; see `CreateWorkersOptions`. */
  lockDuration?: number;
  stalledInterval?: number;
  /** BullMQ-only — see `RuntimeTraits.acceptsHandlerOverrides`. */
  handlerOverrides?: Partial<JobHandlers>;
}

/** Quiet by default: a failing assertion is the signal, not a retry's log. */
export function testLogger(): JobLogger {
  const noop = (): void => {};
  return { debug: noop, info: noop, warn: noop, error: noop };
}

export const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Wait for a terminal state through the seam, on either engine.
 *
 * Polling `getRun` rather than awaiting an engine's own completion primitive is
 * deliberate: `getRun` is what the document-status route calls, so this waits
 * on the same read a user's browser does, and a runtime that finished a job but
 * could not describe it would hang here — which is the correct answer.
 */
export async function pollUntilTerminal(
  jobs: JobRuntime,
  runId: string,
  timeoutMs = 30_000,
): Promise<JobRun> {
  const deadline = Date.now() + timeoutMs;
  let last: JobRun = { status: 'running' };

  while (Date.now() < deadline) {
    last = await jobs.getRun(runId);
    if (last.status !== 'running') {
      return last;
    }
    await sleep(50);
  }

  throw new Error(
    `run "${runId}" was still ${last.status} after ${timeoutMs}ms`,
  );
}

/**
 * Start the runtime `WORKER_RUNTIME` names.
 *
 * The implementations are reached by dynamic import for the same reason
 * `worker.ts` reaches `temporal-runtime.ts` that way: a static import would
 * load `@temporalio/worker` — and its native bridge — into every BullMQ run of
 * this suite, which is the arrangement E6 spent a phase undoing.
 */
export async function startHarness(
  options: HarnessOptions = {},
): Promise<JobRuntimeHarness> {
  const runtime = resolveWorkerRuntime();

  if (runtime === 'temporal') {
    const { startTemporalHarness } = await import('./harness-temporal.js');
    return startTemporalHarness(options);
  }

  const { startBullMqHarness } = await import('./harness-bullmq.js');
  return startBullMqHarness(options);
}
