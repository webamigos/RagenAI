import * as path from 'path';
import dotenvFlow from 'dotenv-flow';

dotenvFlow.config({
  path: path.resolve(process.cwd()),
});

export const targetEnv = process.env.TARGET_ENV!;

export const TEMPORAL_NAMESPACE = process.env.TEMPORAL_NAMESPACE || 'local';
// TODO: below line is needed for Temporal Cloud
// export const TEMPORAL_SERVER_ADDRESS =
//   `${TEMPORAL_NAMESPACE}.${process.env.TEMPORAL_SERVER_ADDRESS}` ||
//   'localhost:7233';

export const TEMPORAL_SERVER_ADDRESS =
  process.env.TEMPORAL_SERVER_ADDRESS || 'localhost:7233';
