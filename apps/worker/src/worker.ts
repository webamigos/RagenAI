import { cleanStaleTmpFiles } from './utils/cleanup-tmp.js';

import { parseWorkerEnv } from './config/env.js';
import {
  isMissingTemporalPackage,
  withCause,
} from './utils/missing-package.js';
import { resolveWorkerRuntime } from '@ragenai/jobs';
import {
  isPiiMaskingMisconfigured,
  PII_MASKING_MISCONFIGURED_MESSAGE,
} from '@ragenai/env';

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
  const { registerShutdownTask } = await import('./instrument.js');

  const { workers, dashboard } = await startBullMqWorker();

  // Registered rather than listening for SIGTERM here. `instrument.ts` already
  // installs the signal handlers and they end in `process.exit(0)` — a second
  // handler does not get a turn, it gets killed halfway through. The telemetry
  // flush is fast and a drain is not, so the drain would have been the half
  // that lost.
  registerShutdownTask(async () => {
    logger.info('draining BullMQ workers');
    // Workers first: the dashboard is a view of them, and closing it early
    // would blind an operator watching a drain they are waiting on.
    await closeBullWorkers(workers);
    await dashboard?.close();
  });

  // Nothing left to await. The workers hold their connections, so the process
  // stays alive, and shutdown belongs to the owner above.
  await new Promise<never>(() => {});
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

  if (runtime === 'bullmq') {
    await runBullMq();
    return;
  }

  // Imported here rather than at the top, so a BullMQ start never loads the
  // Temporal SDK — which is what lets the image ship without it.
  //
  // This is also where a Temporal start fails in the published image, and a
  // bare `Cannot find package '@temporalio/worker'` says nothing about why.
  // Two separate things are absent and only one of them is named by that
  // error: the SDK, which `--omit=dev` leaves out of this image, and the
  // adapter `jobs.ts` loads, which G3 moved out of the repository entirely.
  // `ragen-enterprise`'s image restores both.
  const { runTemporal } = await import('./temporal-runtime.js').catch(
    (error: unknown) => {
      // Anything that is not a missing package is a real failure inside that
      // module, and saying "no Temporal SDK" about it would replace a usable
      // stack with a confident wrong answer.
      if (!isMissingTemporalPackage(error)) {
        throw error;
      }

      throw withCause(
        new Error(
          'WORKER_RUNTIME=temporal, but this build does not include the ' +
            'Temporal SDK. The published worker image ships the BullMQ runtime ' +
            "only (ADR-44): `@temporalio/*` are apps/worker's devDependencies " +
            'and the image installs with --omit=dev. To run on Temporal, use ' +
            "webamigos/ragen-enterprise's worker image, which is FROM this one " +
            'and adds the SDK and the adapter.',
        ),
        error,
      );
    },
  );
  await runTemporal();
}

run().catch((err) => {
  logger.error({ err }, 'Worker failed to start');
  process.exit(1);
});
