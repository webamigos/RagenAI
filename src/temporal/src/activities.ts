export const onEmbeddingProcessCompleted = async (
  documentId: string
): Promise<string> => {
  return `embedding for document #${documentId} has been completed`;
};

export const cancelEmbeddingProcess = async (
  documentId: string
): Promise<string> => {
  return `canceled embedding for document #${documentId}`;
};
