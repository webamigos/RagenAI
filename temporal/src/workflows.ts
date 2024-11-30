/**
 * Workflow Definition
 */
import * as wf from '@temporalio/workflow';

import type * as activities from './activities';
import {
  ACTIVITY_EMBEDDING_STATE_QUERY,
  ACTIVITY_CANCEL_EMBEDDING_COMMAND,
  type StartEmbeddingProcessInput,
} from './shared';

// Reference code: https://github.dev/temporalio/samples-typescript/tree/main/nextjs-ecommerce-oneclick
const { onEmbeddingProcessCompleted, cancelEmbeddingProcess } =
  wf.proxyActivities<typeof activities>({
    startToCloseTimeout: '5s',
  });

/** TODO: In future, we probably will need to configure retry:
define custom policy for nonRetryableErrorTypes if there is
no way that failed activity will ever succeed (for example,
queried not existing open-ai model). */
const { generateRandomAge } = wf.proxyActivities<typeof activities>({
  startToCloseTimeout: '5 seconds',
});

type EmbeddingState =
  | 'EMBEDDING_PENDING'
  | 'EMBEDDING_DONE'
  | 'EMBEDDING_CANCELED';

export const cancelEmbeddingSignal = wf.defineSignal(
  ACTIVITY_CANCEL_EMBEDDING_COMMAND
);

export const embeddingStateQuery = wf.defineQuery<EmbeddingState>(
  ACTIVITY_EMBEDDING_STATE_QUERY
);

export async function EmbeddingWorkflow({
  documentId,
}: StartEmbeddingProcessInput) {
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
    return await cancelEmbeddingProcess({ documentId });
  } else {
    // if embedding is done, call onEmbeddingProcessCompleted function
    embeddingState = 'EMBEDDING_DONE';
    return await onEmbeddingProcessCompleted({ documentId });
  }
}

export async function estimateAgeWorkflow({
  name,
}: {
  name: string;
}): Promise<string> {
  const result = await generateRandomAge({ name });
  return result;
}
