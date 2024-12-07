'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.getTemporalClient = void 0;
const client_1 = require('@temporalio/client');
const consts_1 = require('./consts');
const createClient = () => {
  const cert = process.env.TEMPORAL_CERT; // pem
  const key = process.env.TEMPORAL_KEY; // key
  if (!cert || !key) {
    throw new Error('Missing required Temporal certificates');
  }
  const connection = client_1.Connection.lazy({
    address: consts_1.TEMPORAL_SERVER_ADDRESS,
    tls: {
      clientCertPair: {
        crt: Buffer.from(cert, 'base64'),
        key: Buffer.from(key, 'base64'),
      },
    },
  });
  return new client_1.Client({
    connection,
    namespace: consts_1.TEMPORAL_NAMESPACE,
  });
};
const getTemporalClient = () => {
  return createClient();
};
exports.getTemporalClient = getTemporalClient;
//# sourceMappingURL=client.js.map
