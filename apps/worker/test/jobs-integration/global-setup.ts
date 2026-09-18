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
 * Two ways in — the default, and the override the code checks first:
 *
 * - **A local dev server** by default, downloaded and cached by
 *   `@temporalio/testing`. Not the time-skipping Java stub `workflow.spec.ts`
 *   uses — that one has no scheduler, and a third of this suite is schedules.
 *   **This is the path CI takes as well**, not only a laptop's: `jobs-parity.yml`
 *   sets no address, so both run the same server. Phase E deleted Temporal from
 *   `docker-compose.yml` on purpose, and a compose service or an
 *   `auto-setup` container in the workflow would each undo half of what that
 *   phase was for.
 * - **`JOBS_TEST_TEMPORAL_ADDRESS`** — an override, for a server somebody else
 *   is running. `temporalio/auto-setup` is the closest thing to the "real
 *   Temporal container" §8.3 asks for and exercises the image a deployment
 *   runs, so point this at one when that is the question. Nothing in this
 *   repository sets it.
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
