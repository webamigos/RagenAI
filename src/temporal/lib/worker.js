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
var __importDefault =
  (this && this.__importDefault) ||
  function (mod) {
    return mod && mod.__esModule ? mod : { default: mod };
  };
Object.defineProperty(exports, '__esModule', { value: true });
const dotenv_flow_1 = __importDefault(require('dotenv-flow'));
const path = __importStar(require('path'));
const worker_1 = require('@temporalio/worker');
const activities = __importStar(require('./activities'));
const shared_1 = require('./shared');
dotenv_flow_1.default.config({
  path: path.resolve(__dirname, '../../..'),
});
const workflowOption = () =>
  process.env.NODE_ENV === 'production'
    ? {
        workflowBundle: {
          codePath: require.resolve('../lib/workflow-bundle.js'),
        },
      }
    : { workflowsPath: require.resolve('./workflows') };
run().catch((err) => console.error(err));
async function run() {
  const TEMPORAL_SERVER_ADDRESS =
    process.env.TEMPORAL_SERVER_ADDRESS || 'localhost:7233';
  const connection = await worker_1.NativeConnection.connect({
    address: TEMPORAL_SERVER_ADDRESS,
    // In production, pass options to configure TLS and other settings.
  });
  try {
    const worker = await worker_1.Worker.create({
      connection,
      // workflowsPath: require.resolve('./workflows'),
      ...workflowOption(),
      activities,
      taskQueue: shared_1.TASK_QUEUE_NAME,
      maxConcurrentActivityTaskExecutions: 50,
    });
    await worker.run();
  } finally {
    connection.close();
  }
}
//# sourceMappingURL=worker.js.map
