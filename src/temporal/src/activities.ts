import * as activity from '@temporalio/activity';
import {
  type CancelEmbeddingProcessInput,
  type OnEmbeddingProcessCompletedInput,
} from './shared';

export const onEmbeddingProcessCompleted = async ({
  documentId,
}: OnEmbeddingProcessCompletedInput): Promise<string> => {
  const context = activity.Context.current();
  context.log.info('Calling onEmbeddingProcessCompleted: ', { documentId });
  return `embedding for document #${documentId} has been completed`;
};

export const cancelEmbeddingProcess = async ({
  documentId,
}: CancelEmbeddingProcessInput): Promise<string> => {
  const context = activity.Context.current();
  context.log.info('Calling cancelEmbeddingProcess: ', { documentId });
  return `canceled embedding for document #${documentId}`;
};

// temporary for check test settings
export const estimateAge = async (name: string) => {
  if (name === 'Stefan') {
    return 50;
  }
  return NaN;
};
