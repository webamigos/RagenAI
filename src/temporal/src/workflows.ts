import * as wf from '@temporalio/workflow';

import type * as activities from './activities';

// Reference code: https://github.dev/temporalio/samples-typescript/tree/main/nextjs-ecommerce-oneclick
const { onEmbeddingProcessCompleted, cancelEmbeddingProcess } =
  wf.proxyActivities<typeof activities>({
    startToCloseTimeout: '1 minute',
  });

type EmbeddingState =
  | 'EMBEDDING_PENDING'
  | 'EMBEDDING_DONE'
  | 'EMBEDDING_CANCELED';

export const cancelEmbeddingSignal = wf.defineSignal('cancelEmbedding');

export const embeddingStateQuery =
  wf.defineQuery<EmbeddingState>('embeddingState');

export const EmbeddingWorkflow = async (documentId: string) => {
  let embeddingState: EmbeddingState = 'EMBEDDING_PENDING';

  // handler when state has changed to EMBEDDING_CANCELED
  wf.setHandler(
    cancelEmbeddingSignal,
    () => void (embeddingState = 'EMBEDDING_CANCELED')
  );

  // handler for checking embedding state
  wf.setHandler(embeddingStateQuery, () => embeddingState);

  // check if embedding process is canceled or after 5 seconds
  // TODO: change timeout, currently we need to test if this flow works with temporal
  if (await wf.condition(() => embeddingState === 'EMBEDDING_CANCELED', '5s')) {
    return await cancelEmbeddingProcess(documentId);
  } else {
    // if embedding is done, call onEmbeddingProcessCompleted function
    embeddingState = 'EMBEDDING_DONE';
    return await onEmbeddingProcessCompleted(documentId);
  }
};
