import { type JobContext, type ScoreDocumentPayload } from '@ragenai/jobs';

import type * as activities from '../activities/index.js';

export async function scoreDocument(
  payload: ScoreDocumentPayload,
  ctx: JobContext,
): Promise<void> {
  const {
    isRagScoringEnabled,
    scoreDocumentForRag,
    mergeFileMetadata,
    syncRagScoreToVersion,
    sendSuccessNotification,
  } = ctx.steps<typeof activities>({
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

  // The command refuses when the key is off, so this is a job queued before
  // an operator turned it off. It ends without a model call and without a
  // "scored" notification, because nothing was scored.
  if (!(await isRagScoringEnabled({ orgId }))) {
    ctx.log.info(
      `RAG scoring is off for organization ${orgId}; file ${fileId} not scored`,
    );
    return;
  }

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
        ctx.log.warn(
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
