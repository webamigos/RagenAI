import { proxyActivities } from '@temporalio/workflow';
import type * as activities from '../activities';

export type ScoreDocumentPayload = {
  fileId: string;
  documentId?: string | null;
  orgId: string;
  projectId?: string | null;
  userId?: string | null;
  fileName?: string;
  documentText: string;
};

export async function scoreDocument(
  payload: ScoreDocumentPayload,
): Promise<void> {
  const {
    scoreDocumentForRag,
    mergeFileMetadata,
    syncRagScoreToVersion,
    sendSuccessNotification,
  } = proxyActivities<typeof activities>({
    retry: {
      initialInterval: '2 seconds',
      maximumInterval: '1 minute',
      backoffCoefficient: 2,
      maximumAttempts: 3,
    },
    startToCloseTimeout: '5 minutes',
  });

  const {
    fileId,
    documentId,
    orgId,
    projectId,
    userId,
    fileName,
    documentText,
  } = payload;

  const ragScore = await scoreDocumentForRag({
    documentText,
    orgId,
    projectId,
    userId,
    fileName,
  });

  if (ragScore) {
    await mergeFileMetadata({
      fileId,
      orgId,
      patch: { ragScore, ragScoredAt: new Date().toISOString() },
    });

    if (documentId) {
      await syncRagScoreToVersion({
        documentId,
        ragScore: ragScore as unknown as Record<string, unknown>,
      });
    }
  }

  await sendSuccessNotification({
    content: `Document scored`,
    intlKey: 'document-scored',
    meta: { forceRefresh: true },
  });
}
