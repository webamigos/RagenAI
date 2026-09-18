import type { TestProject } from 'vitest/node';

import { resolveWorkerRuntime } from '@ragenai/jobs';

declare module 'vitest' {
  interface ProvidedContext {
    /** The Temporal this run talks to. Only set when the run is a Temporal one. */
    temporalAddress: string;
  }
}

/**
 * The Temporal server the parity run talks to, started once for the whole run.
 *
 * Two ways in, and the order matters:
 *
 * - **`JOBS_TEST_TEMPORAL_ADDRESS`** — a server somebody else is running. This
 *   is what CI uses: `temporalio/auto-setup` as a service container, which is
 *   the "real Temporal container" the spec's §8.3 asks for, and which exercises
 *   the same image a deployment would run.
 * - **Otherwise, a local dev server**, downloaded and cached by
 *   `@temporalio/testing`. Not the time-skipping Java stub `workflow.spec.ts`
 *   uses — that one has no scheduler, and a third of this suite is schedules.
 *   This is what makes `WORKER_RUNTIME=temporal npm run test:jobs-integration`
 *   work on a laptop, with no container and no compose service: Phase E deleted
 *   Temporal from `docker-compose.yml` on purpose, and putting it back for a
 *   test would undo the thing that phase was for.
 *
 * Started here rather than per harness because a server start is seconds and
 * the suite builds a dozen harnesses — and because a global setup is the only
 * place whose teardown is guaranteed to run, which is what keeps a stray
 * server process from outliving the test run.
 */
export default async function setup(
  project: TestProject,
): Promise<(() => Promise<void>) | undefined> {
  if (resolveWorkerRuntime() !== 'temporal') {
    return undefined;
  }

  const existing = process.env.JOBS_TEST_TEMPORAL_ADDRESS;
  if (existing) {
    project.provide('temporalAddress', existing);
    return undefined;
  }

  // Imported here, not at the top: a BullMQ run must not load the Temporal
  // SDK's native bridge to decide it does not need it.
  const { TestWorkflowEnvironment } = await import('@temporalio/testing');
  const environment = await TestWorkflowEnvironment.createLocal();

  project.provide('temporalAddress', environment.address);

  return async (): Promise<void> => {
    await environment.teardown();
  };
}
