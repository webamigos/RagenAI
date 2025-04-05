import { Client, Connection } from '@temporalio/client';
import { TEMPORAL_SERVER_ADDRESS } from './consts';

const createClient = (): Client => {
  // TODO: below lines are needed for Temporal Cloud
  // const cert = process.env.TEMPORAL_CERT; // pem
  // const key = process.env.TEMPORAL_KEY; // key

  // if (!cert || !key) {
  //   throw new Error('Missing required Temporal certificates');
  // }

  const connection = Connection.lazy({
    address: TEMPORAL_SERVER_ADDRESS,
    // TODO: below lines are needed for Temporal Cloud
    // tls: {
    //   clientCertPair: {
    //     crt: Buffer.from(cert, 'base64'),
    //     key: Buffer.from(key, 'base64'),
    //   },
    // },
  });
  return new Client({ connection });
  // TODO: below line is needed for Temporal Cloud
  // return new Client({ connection, namespace: TEMPORAL_NAMESPACE });
};

export const getTemporalClient = (): Client => {
  return createClient();
};
