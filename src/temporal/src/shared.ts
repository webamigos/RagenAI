export const TASK_QUEUE_NAME = 'ragen-tasks';

export const ACTIVITY_CANCEL_EMBEDDING_COMMAND = 'cancelEmbedding';
export const ACTIVITY_EMBEDDING_STATE_QUERY = 'embeddingState';

export type OnEmbeddingProcessCompletedInput = {
  documentId: string;
};

export type CancelEmbeddingProcessInput = {
  documentId: string;
};

export type StartEmbeddingProcessInput = {
  documentId: string;
};
