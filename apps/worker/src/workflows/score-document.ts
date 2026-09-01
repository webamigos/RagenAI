import { log, proxyActivities } from '@temporalio/workflow';
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
      try {
        await syncRagScoreToVersion({
          documentId,
          orgId,
          ragScore: ragScore as unknown as Record<string, unknown>,
        });
      } catch (syncError) {
        // The activity rethrows so Temporal retries it; only an exhausted
        // budget reaches here. The score is already on the file, so the
        // version simply shows none — worth a line in the log, not a failed
        // workflow.
        log.warn(
          `RAG score not synced to the active version of ${documentId}: ${
            syncError instanceof Error ? syncError.message : String(syncError)
          }`,
        );
      }
    }
  }

  await sendSuccessNotification({
    content: `Document scored`,
    intlKey: 'document-scored',
    meta: { forceRefresh: true },
  });
}
