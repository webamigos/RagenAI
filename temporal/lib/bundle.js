'use strict';
var __importDefault =
  (this && this.__importDefault) ||
  function (mod) {
    return mod && mod.__esModule ? mod : { default: mod };
  };
Object.defineProperty(exports, '__esModule', { value: true });
const worker_1 = require('@temporalio/worker');
const promises_1 = require('fs/promises');
const path_1 = __importDefault(require('path'));
async function bundle() {
  const { code } = await (0, worker_1.bundleWorkflowCode)({
    workflowsPath: require.resolve('./workflows'),
  });
  const codePath = path_1.default.join(__dirname, '../lib/workflow-bundle.js');
  await (0, promises_1.writeFile)(codePath, code);
  console.log(`Bundle written to ${codePath}`);
}
bundle().catch((err) => {
  console.error(err);
  process.exit(1);
});
//# sourceMappingURL=bundle.js.map
