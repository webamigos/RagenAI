import { NativeConnection, Worker } from '@temporalio/worker';

import * as activities from './activities/index.js';
import { TEMPORAL_SERVER_ADDRESS } from './consts.js';
import { TASK_QUEUE_NAME } from './shared.js';
import { translatingFailures } from './temporal-failure.js';
import { resolveWorkflowsPath } from './workflows-path.js';

/**
 * This app's side of the Temporal runtime, in a module of its own so that
 * nothing loads `@temporalio/worker` unless `WORKER_RUNTIME=temporal` selects
 * it.
 *
 * It used to sit in `worker.ts` behind a top-level import, which meant the SDK
 * loaded on every start — including the BullMQ one every install now takes by
 * default (ADR-44). A static import is also what stops an image from being
 * built without the adapter at all: the process would fail at module
 * resolution, before the branch that would never have called this.
 *
 * The mirror of `runBullMq`'s `await import('./bullmq-runtime.js')`, and for
 * the same reason. `worker.ts` is the only file that branches on the runtime.
 */
export async function runTemporal(): Promise<void> {
  const connection = await NativeConnection.connect({
    address: TEMPORAL_SERVER_ADDRESS,
  });

  const worker = await Worker.create({
    connection,
    workflowsPath: resolveWorkflowsPath(),
    activities: translatingFailures(activities),
    taskQueue: TASK_QUEUE_NAME,
    maxConcurrentActivityTaskExecutions: 50,
  });

  await worker.run();
  await connection.close();
}
