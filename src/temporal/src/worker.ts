import { NativeConnection, Worker } from '@temporalio/worker';

import * as activities from './activities';
import { TASK_QUEUE_NAME } from './shared';
import { TEMPORAL_NAMESPACE, TEMPORAL_SERVER_ADDRESS } from './consts';

const workflowOption = () =>
  process.env.NODE_ENV === 'production'
    ? {
        workflowBundle: {
          codePath: require.resolve('../workflow-bundle.js'),
        },
      }
    : { workflowsPath: require.resolve('./workflows') };

async function run() {
  const cert = process.env.TEMPORAL_CERT; // pem
  const key = process.env.TEMPORAL_KEY; // key

  if (!cert || !key) {
    throw new Error('Missing required Temporal certificates');
  }

  const connection = await NativeConnection.connect({
    address: TEMPORAL_SERVER_ADDRESS,
    tls: {
      clientCertPair: {
        crt: Buffer.from(cert, 'base64'),
        key: Buffer.from(key, 'base64'),
      },
    },
  });
  try {
    const worker = await Worker.create({
      connection,
      namespace: TEMPORAL_NAMESPACE,
      ...workflowOption(),
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
