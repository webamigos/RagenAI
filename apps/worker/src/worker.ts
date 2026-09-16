import { NativeConnection, Worker } from '@temporalio/worker';
import { cleanStaleTmpFiles } from './utils/cleanup-tmp.js';

import * as activities from './activities/index.js';
import { TASK_QUEUE_NAME } from './shared.js';
import { TEMPORAL_SERVER_ADDRESS } from './consts.js';
import { parseWorkerEnv } from './config/env.js';
import { resolveRunnableRuntime } from './runtime-guard.js';
import {
  isPiiMaskingMisconfigured,
  PII_MASKING_MISCONFIGURED_MESSAGE,
} from '@ragenai/env';

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

/**
 * A runtime the contract accepts but this build cannot run is refused here,
 * before anything connects — see `runtime-guard.ts`. Falling through to the
 * Temporal bootstrap below would give an operator who selected BullMQ a worker
 * that starts, stays healthy and never picks up a job.
 */
const runnable = resolveRunnableRuntime();

if (!runnable.ok) {
  // eslint-disable-next-line no-console
  console.error(runnable.message);
  process.exit(1);
}

/**
 * `FEATURE_FLAG_PII_MASKING=1` used to be the whole switch. Availability now
 * follows the two Presidio URLs, so an upgrade that carried the flag and
 * relied on the old built-in defaults would stop masking — and a security
 * control turning itself off during an upgrade must not do so quietly. Loud,
 * and not fatal: refusing to start would take document ingest down over a
 * setting the deployment may no longer want.
 */
if (isPiiMaskingMisconfigured()) {
  // eslint-disable-next-line no-console
  console.error(`[security] ${PII_MASKING_MISCONFIGURED_MESSAGE}`);
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
