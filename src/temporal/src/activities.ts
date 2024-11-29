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

function randomNumber(min: number, max: number) {
  return Math.random() * (max - min) + min;
}

// temporary for check test settings
export const estimateAge = async () => {
  return Math.round(randomNumber(24, 67));
};
