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
exports.estimateAge =
  exports.cancelEmbeddingProcess =
  exports.onEmbeddingProcessCompleted =
    void 0;
const activity = __importStar(require('@temporalio/activity'));
const onEmbeddingProcessCompleted = async ({ documentId }) => {
  const context = activity.Context.current();
  context.log.info('Calling onEmbeddingProcessCompleted: ', { documentId });
  return `embedding for document #${documentId} has been completed`;
};
exports.onEmbeddingProcessCompleted = onEmbeddingProcessCompleted;
const cancelEmbeddingProcess = async ({ documentId }) => {
  const context = activity.Context.current();
  context.log.info('Calling cancelEmbeddingProcess: ', { documentId });
  return `canceled embedding for document #${documentId}`;
};
exports.cancelEmbeddingProcess = cancelEmbeddingProcess;
// temporary for check test settings
const estimateAge = async (name) => {
  if (name === 'Stefan') {
    return 50;
  }
  return NaN;
};
exports.estimateAge = estimateAge;
//# sourceMappingURL=activities.js.map
