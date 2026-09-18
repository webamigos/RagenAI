import { randomUUID } from 'node:crypto';

import { inject } from 'vitest';

import { Client, Connection } from '@temporalio/client';
import {
  bundleWorkflowCode,
  DefaultLogger,
  NativeConnection,
  Runtime,
  Worker,
  type WorkflowBundle,
} from '@temporalio/worker';

import type { JobRun } from '@ragenai/jobs';
import { TemporalJobRuntime } from '@ragenai/jobs-temporal';

import { createMockActivities } from '../../src/__tests__/fixtures/mock-activities.js';
import { translatingFailures } from '../../src/temporal-failure.js';
import { resolveWorkflowsPath } from '../../src/workflows-path.js';
import {
  pollUntilTerminal,
  sleep,
  type HarnessOptions,
  type JobRuntimeHarness,
} from './harness.js';

/**
 * The Temporal half of the parity suite — the nightly job of the spec's §8.3.
 *
 * It starts the *same* workflows from the *same* path the worker uses
 * (`resolveWorkflowsPath()`), registers the *same* activity stubs the BullMQ
 * harness injects, and drives them through `TemporalJobRuntime` — the adapter
 * `apps/web` and `apps/api` would hold under `WORKER_RUNTIME=temporal`. What is
 * real here is the engine: a durable execution, its own retry policies, its own
 * scheduler.
 *
 * Where the server comes from is `global-setup.ts`'s problem, not this file's.
 */

/** Which server, and how a worker reaches it. */
const address = (): string =>
  process.env.JOBS_TEST_TEMPORAL_ADDRESS ?? inject('temporalAddress');

/**
 * Build the workflow bundle once, not once per harness.
 *
 * `Worker.create({ workflowsPath })` bundles the workflow module with webpack
 * on every call — several seconds each, and this suite starts a dozen harnesses.
 * The bundle is a pure function of the source, so hoisting it is free
 * correctness-wise and takes the Temporal run from minutes to seconds.
 */
let bundled: Promise<WorkflowBundle> | undefined;
const workflowBundle = (): Promise<WorkflowBundle> =>
  (bundled ??= bundleWorkflowCode({ workflowsPath: resolveWorkflowsPath() }));

/**
 * Quiet the SDK, once per process.
 *
 * `Runtime.install` throws if it is called twice, and this harness starts many
 * times in one file — so the flag is the guard rather than a try/catch, which
 * would also swallow a real installation failure.
 */
let runtimeInstalled = false;
function installQuietRuntime(): void {
  if (!runtimeInstalled) {
    Runtime.install({ logger: new DefaultLogger('ERROR') });
    runtimeInstalled = true;
  }
}

export async function startTemporalHarness(
  options: HarnessOptions,
): Promise<JobRuntimeHarness> {
  if (options.handlerOverrides) {
    // Not a silent no-op: a suite that thought it had replaced a handler and
    // silently ran the real pipeline would report a pass about the wrong code.
    throw new Error(
      'handlerOverrides is BullMQ-only — Temporal loads workflows from a ' +
        'sandboxed bundle built from disk, so a closure cannot reach them. ' +
        'Guard the test with RuntimeTraits.acceptsHandlerOverrides instead.',
    );
  }

  installQuietRuntime();

  const activities = options.activities ?? createMockActivities();
  /**
   * One queue per harness.
   *
   * Temporal keeps every execution in a namespace that outlives the harness
   * that made it, so two harnesses sharing `ragen-tasks` would poll for each
   * other's work — and a schedule from a closed harness would still find a
   * worker. The BullMQ side gets the same isolation from flushing its database.
   */
  const taskQueue = `jobs-integration-${randomUUID()}`;

  const clientConnection = await Connection.connect({ address: address() });
  const workerConnection = await NativeConnection.connect({
    address: address(),
  });

  const client = new Client({ connection: clientConnection });
  const jobs = new TemporalJobRuntime({ client, taskQueue });

  const worker = await Worker.create({
    connection: workerConnection,
    workflowBundle: await workflowBundle(),
    // The production wrapping, not a shortcut: `JobFailure.nonRetryable`
    // reaches Temporal as `ApplicationFailure.nonRetryable` only because of
    // this, and the retry suite asserts exactly that difference.
    activities: translatingFailures(activities),
    taskQueue,
    maxConcurrentActivityTaskExecutions: options.concurrency ?? 50,
  });

  let running: Promise<void> | undefined;
  const startConsuming = (): void => {
    running ??= worker.run();
  };

  if (options.consume !== false) {
    startConsuming();
  }

  const stopConsuming = async (): Promise<void> => {
    if (running) {
      worker.shutdown();
      await running;
      running = undefined;
    }
  };

  return {
    runtimeName: 'temporal',
    jobs,
    activities,
    startConsuming,
    stopConsuming,
    /**
     * A settled view, because Temporal's schedule list is served by visibility
     * and visibility is eventually consistent. One read right after an upsert
     * can miss it and one right after a delete can still show it — neither is
     * the engine disagreeing with the assertion, it is the assertion arriving
     * first. Two identical consecutive reads is the cheapest honest answer;
     * BullMQ needs none of this because its schedules are keys in Redis.
     */
    async listScheduleIds(): Promise<string[]> {
      const deadline = Date.now() + 15_000;
      let previous: string | undefined;

      for (;;) {
        const ids: string[] = [];
        for await (const schedule of client.schedule.list()) {
          ids.push(schedule.scheduleId);
        }
        ids.sort();

        const seen = ids.join(',');
        if (seen === previous || Date.now() > deadline) {
          return ids;
        }
        previous = seen;
        await sleep(500);
      }
    },
    waitForRun: (runId: string, timeoutMs?: number): Promise<JobRun> =>
      pollUntilTerminal(jobs, runId, timeoutMs),
    async close(): Promise<void> {
      await stopConsuming();
      await workerConnection.close();
      await clientConnection.close();
    },
  };
}
