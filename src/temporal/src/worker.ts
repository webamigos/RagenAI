import dotenvFlow from 'dotenv-flow';
import * as path from 'path';
import { NativeConnection, Worker } from '@temporalio/worker';

import * as activities from './activities';
import { TASK_QUEUE_NAME } from './shared';

dotenvFlow.config({
  path: path.resolve(__dirname, '../../..'),
});

run().catch((err) => console.error(err));

async function run() {
  const TEMPORAL_SERVER_ADDRESS =
    process.env.TEMPORAL_SERVER_ADDRESS || 'localhost:7233';

  const connection = await NativeConnection.connect({
    address: TEMPORAL_SERVER_ADDRESS,
    // In production, pass options to configure TLS and other settings.
  });
  try {
    const worker = await Worker.create({
      connection,
      workflowsPath: require.resolve('./workflows'),
      activities,
      taskQueue: TASK_QUEUE_NAME,
    });
    await worker.run();
  } finally {
    connection.close();
  }
}
