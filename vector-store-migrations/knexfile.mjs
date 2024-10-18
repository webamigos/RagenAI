import dotenvFlow from 'dotenv-flow';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenvFlow.config({
  path: join(__dirname, '..'),
});

const knexConfig = {
  client: 'postgresql',
  connection: {
    connectionString: process.env.DIRECT_URL,
  },
  migrations: {
    directory: join(__dirname, 'migrations'),
    tableName: 'migrations',
    extension: 'mjs',
  },
};

export default knexConfig;
