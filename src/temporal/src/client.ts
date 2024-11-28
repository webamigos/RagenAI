import fs from 'fs-extra';

import { Client, Connection } from '@temporalio/client';
import {
  certificatePath,
  TEMPORAL_NAMESPACE,
  TEMPORAL_SERVER_ADDRESS,
} from './consts';

const createClient = async (): Promise<Client> => {
  const cert = await fs.readFile(`${certificatePath}.pem`);
  const key = await fs.readFile(`${certificatePath}.key`);

  const connection = Connection.lazy({
    address: TEMPORAL_SERVER_ADDRESS,
    tls: {
      clientCertPair: {
        crt: cert,
        key,
      },
    },
  });
  return new Client({ connection, namespace: TEMPORAL_NAMESPACE });
};

export const getTemporalClient = async (): Promise<Client> => {
  return await createClient();
};
