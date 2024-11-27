import dotenvFlow from 'dotenv-flow';
import * as path from 'path';

import { Client, Connection } from '@temporalio/client';

dotenvFlow.config({
  path: path.resolve(__dirname, '../../..'),
});

const createClient = (): Client => {
  const TEMPORAL_SERVER_ADDRESS =
    process.env.TEMPORAL_SERVER_ADDRESS || 'localhost:7233';

  const connection = Connection.lazy({
    address: TEMPORAL_SERVER_ADDRESS,
    // In production, pass options to configure TLS and other settings.
  });
  return new Client({ connection });
};

const client: Client = createClient();

export const getTemporalClient = (): Client => {
  return client;
};
