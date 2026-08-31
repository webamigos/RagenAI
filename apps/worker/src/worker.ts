import { NativeConnection, Worker } from '@temporalio/worker';
import { cleanStaleTmpFiles } from './utils/cleanup-tmp';

import * as activities from './activities';
import { TASK_QUEUE_NAME } from './shared';
import { TEMPORAL_SERVER_ADDRESS } from './consts';
import { validateEnvs } from './validateEnvVars';

const validateEnvsResult = validateEnvs();

if (!validateEnvsResult.success) {
  console.error(
    'Environment variable validation errors:',
    validateEnvsResult.error.format(),
  );
  process.exit(1);
}

import { logger } from './services/logger';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const workflowOption = () =>
  process.env.NODE_ENV === 'production'
    ? {
        workflowBundle: {
          codePath: require.resolve('../workflow-bundle.js'),
        },
      }
    : { workflowsPath: require.resolve('./workflows') };

async function run() {
  const { instrumentationReady } = await import('./instrument.js');
  await instrumentationReady;

  cleanStaleTmpFiles();

  const connection = await NativeConnection.connect({
    address: TEMPORAL_SERVER_ADDRESS,
  });

  const worker = await Worker.create({
    connection,
    workflowsPath: require.resolve('./workflows'),
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
