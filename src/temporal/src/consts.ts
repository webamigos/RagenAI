import * as path from 'path';
import dotenvFlow from 'dotenv-flow';

dotenvFlow.config({
  path: path.resolve(process.cwd()),
});

export const targetEnv = process.env.TARGET_ENV!;
export const certificatePath = path.resolve(
  process.cwd(),
  'src/temporal/certs',
  targetEnv
);

export const TEMPORAL_NAMESPACE = process.env.TEMPORAL_NAMESPACE || 'local';
export const TEMPORAL_SERVER_ADDRESS =
  `${TEMPORAL_NAMESPACE}.${process.env.TEMPORAL_SERVER_ADDRESS}` ||
  'localhost:7233';
