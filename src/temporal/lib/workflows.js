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
exports.estimateAgeWorkflow =
  exports.EmbeddingWorkflow =
  exports.embeddingStateQuery =
  exports.cancelEmbeddingSignal =
    void 0;
/**
 * Workflow Definition
 */
const wf = __importStar(require('@temporalio/workflow'));
const shared_1 = require('./shared');
// Reference code: https://github.dev/temporalio/samples-typescript/tree/main/nextjs-ecommerce-oneclick
const { onEmbeddingProcessCompleted, cancelEmbeddingProcess } =
  wf.proxyActivities({
    startToCloseTimeout: '5s',
  });
/** TODO: In future, we probably will need to configure retry:
define custom policy for nonRetryableErrorTypes if there is
no way that failed activity will ever succeed (for example,
queried not existing open-ai model). */
const { estimateAge } = wf.proxyActivities({
  startToCloseTimeout: '5 seconds',
});
exports.cancelEmbeddingSignal = wf.defineSignal(
  shared_1.ACTIVITY_CANCEL_EMBEDDING_COMMAND
);
exports.embeddingStateQuery = wf.defineQuery(
  shared_1.ACTIVITY_EMBEDDING_STATE_QUERY
);
const EmbeddingWorkflow = async ({ documentId }) => {
  let embeddingState = 'EMBEDDING_PENDING';
  // handler when state has changed to EMBEDDING_CANCELED
  wf.setHandler(
    exports.cancelEmbeddingSignal,
    () => void (embeddingState = 'EMBEDDING_CANCELED')
  );
  // handler for checking embedding state
  wf.setHandler(exports.embeddingStateQuery, () => embeddingState);
  // check if embedding process is canceled or after 5 seconds
  // TODO: change timeout, currently we need to test if this flow works with temporal
  if (await wf.condition(() => embeddingState === 'EMBEDDING_CANCELED', '5s')) {
    return await cancelEmbeddingProcess({ documentId });
  } else {
    // if embedding is done, call onEmbeddingProcessCompleted function
    embeddingState = 'EMBEDDING_DONE';
    return await onEmbeddingProcessCompleted({ documentId });
  }
};
exports.EmbeddingWorkflow = EmbeddingWorkflow;
async function estimateAgeWorkflow(name) {
  const age = await estimateAge(name);
  return `${name} has an estimated age of ${age}`;
}
exports.estimateAgeWorkflow = estimateAgeWorkflow;
//# sourceMappingURL=workflows.js.map
