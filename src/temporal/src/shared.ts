export const TASK_QUEUE_NAME = 'smartrag-tasks';

export type OnEmbeddingProcessCompletedInput = {
  documentId: string;
};

export type CancelEmbeddingProcessInput = {
  documentId: string;
};

export type StartEmbeddingProcessInput = {
  documentId: string;
};
