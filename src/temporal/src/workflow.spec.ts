import * as path from 'path';

import { TestWorkflowEnvironment } from '@temporalio/testing';
import { WorkflowCoverage } from '@temporalio/nyc-test-coverage';
import { Worker, Runtime, DefaultLogger, LogEntry } from '@temporalio/worker';
import { embeddingWorkflow, estimateAgeWorkflow } from './workflows';

import { estimateAge } from './activities';
import { ACTIVITY_CANCEL_EMBEDDING_COMMAND } from './shared';

let testEnv: TestWorkflowEnvironment;

const workflowCoverage = new WorkflowCoverage();

beforeAll(async () => {
  // Use console.log instead of console.error to avoid red output
  // Filter INFO log messages for clearer test output
  Runtime.install({
    logger: new DefaultLogger('WARN', (entry: LogEntry) =>
      console.log(`[${entry.level}]`, entry.message)
    ),
  });

  testEnv = await TestWorkflowEnvironment.createLocal();
});

afterAll(async () => {
  await testEnv?.teardown();
});

afterAll(() => {
  workflowCoverage.mergeIntoGlobalCoverage();
});

describe('embeddingWorkflow', () => {
  // it('runs EmbeddingWorkflow with activity call', async () => {
  //   const { client, nativeConnection } = testEnv;
  //   const worker = await Worker.create({
  //     connection: nativeConnection,
  //     taskQueue: 'test',
  //     workflowsPath: require.resolve('./workflows'),
  //     activities,
  //   });

  //   const result = await worker.runUntil(async () => {
  //     const handle = await client.workflow.start(embeddingWorkflow, {
  //       args: [{ documentId: '4567' }],
  //       workflowId: 'test',
  //       taskQueue: 'test',
  //     });
  //     await handle.signal(ACTIVITY_CANCEL_EMBEDDING_COMMAND);
  //   });

  //   expect(result).toBe(`canceled embedding for document #4321`);
  // });

  it.skip('runs estimateAgeWorkflow with activity call', async () => {
    const { client, nativeConnection } = testEnv;
    const worker = await Worker.create(
      workflowCoverage.augmentWorkerOptions({
        connection: nativeConnection,
        taskQueue: 'test',
        workflowsPath: path.resolve(__dirname, './workflows.js'),
        activities: {
          estimateAge: async () => 50,
        },
      })
    );

    await worker.runUntil(async () => {
      const result = await client.workflow.execute(estimateAge, {
        args: ['Stefan'],
        workflowId: 'testId',
        taskQueue: 'test',
      });
      expect(result).toEqual('Stefan has an estimated age of 50');
    });
  });
});
