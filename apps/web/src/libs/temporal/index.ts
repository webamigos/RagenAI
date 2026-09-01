// Named re-exports rather than `export *`: the tree-shaking rule in
// @ragenai/eslint-config/next forbids the star form, and this barrel is
// imported from route handlers where dragging in the whole client matters.
export { getTemporalClient } from './client';

export {
  targetEnv,
  TEMPORAL_NAMESPACE,
  TEMPORAL_SERVER_ADDRESS,
  TASK_QUEUE_NAME,
  ACTIVITY_CANCEL_EMBEDDING_COMMAND,
  ACTIVITY_EMBEDDING_STATE_QUERY,
} from './consts';

export type {
  OnEmbeddingProcessCompletedInput,
  CancelEmbeddingProcessInput,
  StartEmbeddingProcessInput,
} from './types';
