'use strict';
var __createBinding =
  (this && this.__createBinding) ||
  (Object.create
    ? function (o, m, k, k2) {
        if (k2 === undefined) k2 = k;
        var desc = Object.getOwnPropertyDescriptor(m, k);
        if (
          !desc ||
          ('get' in desc ? !m.__esModule : desc.writable || desc.configurable)
        ) {
          desc = {
            enumerable: true,
            get: function () {
              return m[k];
            },
          };
        }
        Object.defineProperty(o, k2, desc);
      }
    : function (o, m, k, k2) {
        if (k2 === undefined) k2 = k;
        o[k2] = m[k];
      });
var __setModuleDefault =
  (this && this.__setModuleDefault) ||
  (Object.create
    ? function (o, v) {
        Object.defineProperty(o, 'default', { enumerable: true, value: v });
      }
    : function (o, v) {
        o['default'] = v;
      });
var __importStar =
  (this && this.__importStar) ||
  function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null)
      for (var k in mod)
        if (k !== 'default' && Object.prototype.hasOwnProperty.call(mod, k))
          __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
  };
Object.defineProperty(exports, '__esModule', { value: true });
const path = __importStar(require('path'));
const testing_1 = require('@temporalio/testing');
const nyc_test_coverage_1 = require('@temporalio/nyc-test-coverage');
const worker_1 = require('@temporalio/worker');
const activities_1 = require('./activities');
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
  testEnv = await testing_1.TestWorkflowEnvironment.createLocal();
});
afterAll(async () => {
  await testEnv?.teardown();
});
afterAll(() => {
  workflowCoverage.mergeIntoGlobalCoverage();
});
describe('EmbeddingWorkflow', () => {
  // it('runs EmbeddingWorkflow with activity call', async () => {
  //   const { client, nativeConnection } = testEnv;
  //   const worker = await Worker.create({
  //     connection: nativeConnection,
  //     taskQueue: 'test',
  //     workflowsPath: require.resolve('./workflows'),
  //     activities,
  //   });
  //   const result = await worker.runUntil(async () => {
  //     const handle = await client.workflow.start(EmbeddingWorkflow, {
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
    const worker = await worker_1.Worker.create(
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
      const result = await client.workflow.execute(activities_1.estimateAge, {
        args: ['Stefan'],
        workflowId: 'testId',
        taskQueue: 'test',
      });
      expect(result).toEqual('Stefan has an estimated age of 50');
    });
  });
});
//# sourceMappingURL=workflow.spec.js.map
