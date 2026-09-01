import { proxyActivities } from '@temporalio/workflow';
import type * as activities from '../activities';

export type OptimizeDocumentPayload = {
  jobId: string;
  documentId: string;
  orgId: string;
  projectId?: string | null;
  userId?: string | null;
  documentText: string;
  documentTitle?: string;
};

export async function optimizeDocument(
  payload: OptimizeDocumentPayload,
): Promise<void> {
  const { optimizeDocumentSuggestions, sendSuccessNotification } =
    proxyActivities<typeof activities>({
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
