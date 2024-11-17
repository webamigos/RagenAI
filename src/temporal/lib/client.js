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
exports.getTemporalClient = void 0;
const dotenv_flow_1 = __importDefault(require('dotenv-flow'));
const path = __importStar(require('path'));
const client_1 = require('@temporalio/client');
dotenv_flow_1.default.config({
  path: path.resolve(__dirname, '../../..'),
});
const createClient = () => {
  const TEMPORAL_SERVER_ADDRESS =
    process.env.TEMPORAL_SERVER_ADDRESS || 'localhost:7233';
  const connection = client_1.Connection.lazy({
    address: TEMPORAL_SERVER_ADDRESS,
    // In production, pass options to configure TLS and other settings.
  });
  return new client_1.Client({ connection });
};
const client = createClient();
const getTemporalClient = () => {
  return client;
};
exports.getTemporalClient = getTemporalClient;
//# sourceMappingURL=client.js.map
