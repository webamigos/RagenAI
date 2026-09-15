import { type JobContext, type OptimizeDocumentPayload } from '@ragenai/jobs';

import type * as activities from '../activities/index.js';

export async function optimizeDocument(
  payload: OptimizeDocumentPayload,
  ctx: JobContext,
): Promise<void> {
  const { optimizeDocumentSuggestions, sendSuccessNotification } = ctx.steps<
    typeof activities
  >({
    retry: {
      initialInterval: '2 seconds',
      maximumInterval: '2 minutes',
      backoffCoefficient: 2,
      maximumAttempts: 2,
    },
    // Scoring N suggestions sequentially can take several minutes
    startToCloseTimeout: '15 minutes',
  });

  await optimizeDocumentSuggestions(payload);

  await sendSuccessNotification({
    content: `Document optimization complete`,
    intlKey: 'document-optimization-complete',
    meta: { forceRefresh: true },
  });
}
