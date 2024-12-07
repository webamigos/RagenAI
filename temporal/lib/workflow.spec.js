'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
const testing_1 = require('@temporalio/testing');
const nyc_test_coverage_1 = require('@temporalio/nyc-test-coverage');
const worker_1 = require('@temporalio/worker');
// import { embeddingWorkflow, estimateAgeWorkflow } from './workflows';
const nanoid_1 = require('nanoid');
const workflows_1 = require('./workflows');
let testEnv;
const workflowCoverage = new nyc_test_coverage_1.WorkflowCoverage();
beforeAll(async () => {
  // Use console.log instead of console.error to avoid red output
  // Filter INFO log messages for clearer test output
  worker_1.Runtime.install({
    logger: new worker_1.DefaultLogger('WARN', (entry) =>
      console.log(`[${entry.level}]`, entry.message)
    ),
  });
  testEnv = await testing_1.TestWorkflowEnvironment.createTimeSkipping();
});
afterAll(async () => {
  await testEnv?.teardown();
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
  it('runs estimateAgeWorkflow with activity call', async () => {
    const name = 'Stefan';
    const age = 43;
    const worker = await worker_1.Worker.create({
      connection: testEnv.nativeConnection,
      taskQueue: 'test',
      workflowsPath: require.resolve('./workflows'),
      activities: {
        generateRandomAge: async () => `${name} has an estimated age of ${age}`,
      },
    });
    const result = await worker.runUntil(
      testEnv.client.workflow.execute(workflows_1.newEstimateAgeWorkflow, {
        args: [{ name }],
        workflowId: `person-${(0, nanoid_1.nanoid)()}`,
        taskQueue: 'test',
      })
    );
    expect(result).toEqual('Stefan has an estimated age of 43');
  });
});
//# sourceMappingURL=workflow.spec.js.map
