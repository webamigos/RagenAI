import { NativeConnection, Worker } from '@temporalio/worker';
import { cleanStaleTmpFiles } from './utils/cleanup-tmp.js';

import * as activities from './activities/index.js';
import { TASK_QUEUE_NAME } from './shared.js';
import { TEMPORAL_SERVER_ADDRESS } from './consts.js';
import { parseWorkerEnv } from './config/env.js';
import { resolveWorkflowsPath } from './workflows-path.js';

const env = parseWorkerEnv();

if (!env.ok) {
  // The logger is not up yet — this runs before instrumentation, and a silent
  // exit here is the hardest kind of misconfiguration to diagnose. The report
  // is the shared one every app prints, rather than zod's nested dump.
  // eslint-disable-next-line no-console
  console.error(env.report);
  process.exit(1);
}

import { logger } from './services/logger.js';

async function run() {
  const { instrumentationReady } = await import('./instrument.js');
  await instrumentationReady;

  cleanStaleTmpFiles();

  const connection = await NativeConnection.connect({
    address: TEMPORAL_SERVER_ADDRESS,
  });

  const worker = await Worker.create({
    connection,
    workflowsPath: resolveWorkflowsPath(),
    activities,
    taskQueue: TASK_QUEUE_NAME,
    maxConcurrentActivityTaskExecutions: 50,
  });

  await worker.run();
  await connection.close();
}

run().catch((err) => {
  logger.error({ err }, 'Worker failed to start');
  process.exit(1);
});
