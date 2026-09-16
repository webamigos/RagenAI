import { NativeConnection, Worker } from '@temporalio/worker';
import { cleanStaleTmpFiles } from './utils/cleanup-tmp.js';

import * as activities from './activities/index.js';
import { TASK_QUEUE_NAME } from './shared.js';
import { TEMPORAL_SERVER_ADDRESS } from './consts.js';
import { parseWorkerEnv } from './config/env.js';
import { resolveWorkerRuntime } from '@ragenai/jobs';
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

async function runTemporal(): Promise<void> {
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

/**
 * BullMQ has no equivalent of `worker.run()` blocking until shutdown — the
 * workers consume from the moment they are constructed — so this waits for a
 * signal and closes them.
 *
 * Closing is not tidiness. A process killed mid-job leaves its lock held until
 * it expires, five minutes later by `LOCK_DURATION_MS`, and BullMQ then
 * redelivers work that was nearly finished. Every redeploy would pay the cost
 * that long lock exists to avoid. `close()` stops taking new jobs and waits
 * for the ones in flight.
 */
async function runBullMq(): Promise<void> {
  const { startBullMqWorker, closeBullWorkers } =
    await import('./bullmq-runtime.js');

  const workers = await startBullMqWorker();

  await new Promise<void>((resolve) => {
    let closing = false;

    const shutdown = (signal: string): void => {
      // A second signal during a slow drain must not start a second close:
      // the first is already waiting for the jobs in flight.
      if (closing) {
        logger.warn({ signal }, 'already draining; ignoring');
        return;
      }
      closing = true;

      logger.info({ signal }, 'draining BullMQ workers');
      closeBullWorkers(workers)
        .catch((err) => logger.error({ err }, 'failed to close cleanly'))
        .finally(resolve);
    };

    process.once('SIGTERM', () => shutdown('SIGTERM'));
    process.once('SIGINT', () => shutdown('SIGINT'));
  });
}

async function run() {
  const { instrumentationReady } = await import('./instrument.js');
  await instrumentationReady;

  cleanStaleTmpFiles();

  // The only place this process branches on the runtime. What follows each
  // branch is engine-specific by definition; what the handlers do is not,
  // which is the whole return on the seam.
  const runtime = resolveWorkerRuntime();
  logger.info({ runtime }, 'starting worker');

  await (runtime === 'bullmq' ? runBullMq() : runTemporal());
}

run().catch((err) => {
  logger.error({ err }, 'Worker failed to start');
  process.exit(1);
});
