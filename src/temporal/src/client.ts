import { Client, Connection } from '@temporalio/client';

const createClient = (): Client => {
  const connection = Connection.lazy({
    address: 'localhost:7233',
    // In production, pass options to configure TLS and other settings.
  });
  return new Client({ connection });
};

const client: Client = createClient();

export const getTemporalClient = (): Client => {
  return client;
};
