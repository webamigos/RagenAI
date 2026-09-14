import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { NativeConnection, Worker } from '@temporalio/worker';
import { cleanStaleTmpFiles } from './utils/cleanup-tmp.js';

import * as activities from './activities/index.js';
import { TASK_QUEUE_NAME } from './shared.js';
import { TEMPORAL_SERVER_ADDRESS } from './consts.js';
import { parseWorkerEnv } from './config/env.js';

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

/**
 * Where Temporal should look for the workflow implementations.
 *
 * This was `require.resolve('./workflows')`, which quietly did real work: under
 * `tsx` it found `src/workflows.ts`, and under `node dist/worker.js` it found
 * `dist/workflows.js`. ESM has no `require`, and `import.meta.resolve` is not a
 * substitute here — it does not consult tsx's loader, so it would hand back a
 * `src/workflows.js` that does not exist.
 *
 * The path has to exist on disk either way: Temporal's bundler calls
 * `statSync` on it before webpack ever sees it, to decide whether to generate a
 * file-sibling or directory-sibling entrypoint. So pick the extension by
 * looking, and fail loudly rather than handing Temporal a path to nothing.
 */
function resolveWorkflowsPath(): string {
  for (const candidate of ['./workflows/index.ts', './workflows/index.js']) {
    const path = fileURLToPath(new URL(candidate, import.meta.url));
    if (existsSync(path)) {
      return path;
    }
  }

  throw new Error(
    `No workflows module beside ${import.meta.url} — looked for ` +
      `workflows/index.ts (tsx) and workflows/index.js (compiled). ` +
      `Did the build run?`,
  );
}

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
