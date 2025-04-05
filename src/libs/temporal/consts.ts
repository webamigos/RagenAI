export const targetEnv = process.env.TARGET_ENV!;

export const TEMPORAL_NAMESPACE = process.env.TEMPORAL_NAMESPACE || 'local';
// TODO: below line is needed for Temporal Cloud
// export const TEMPORAL_SERVER_ADDRESS =
//   `${TEMPORAL_NAMESPACE}.${process.env.TEMPORAL_SERVER_ADDRESS}` ||
//   'localhost:7233';

export const TEMPORAL_SERVER_ADDRESS =
  process.env.TEMPORAL_SERVER_ADDRESS || 'localhost:7233';

export const TASK_QUEUE_NAME = 'ragen-tasks';

export const ACTIVITY_CANCEL_EMBEDDING_COMMAND = 'cancelEmbedding';
export const ACTIVITY_EMBEDDING_STATE_QUERY = 'embeddingState';
