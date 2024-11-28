import { NativeConnection, Worker } from '@temporalio/worker';
import fs from 'fs-extra';

import * as activities from './activities';
import { TASK_QUEUE_NAME } from './shared';
import {
  certificatePath,
  TEMPORAL_NAMESPACE,
  TEMPORAL_SERVER_ADDRESS,
} from './consts';

async function run() {
  const cert = await fs.readFile(`${certificatePath}.pem`);
  const key = await fs.readFile(`${certificatePath}.key`);

  const connection = await NativeConnection.connect({
    address: TEMPORAL_SERVER_ADDRESS,
    tls: {
      clientCertPair: {
        crt: cert,
        key,
      },
    },
  });
  try {
    const worker = await Worker.create({
      connection,
      namespace: TEMPORAL_NAMESPACE,
      workflowsPath: require.resolve('./workflows'),
      activities,
      taskQueue: TASK_QUEUE_NAME,
      maxConcurrentActivityTaskExecutions: 50,
    });
    await worker.run();
  } finally {
    connection.close();
  }
}

run().catch((err) => console.error(err));
