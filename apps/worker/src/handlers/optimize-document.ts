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

  // A shorter policy than the suggestions', and its own step: scoring is
  // one model call, and a failure here must not cost the suggestions.
  const { scoreDocumentBaseline } = ctx.steps<typeof activities>({
    retry: {
      initialInterval: '2 seconds',
      maximumInterval: '1 minute',
      backoffCoefficient: 2,
      maximumAttempts: 2,
    },
    startToCloseTimeout: '5 minutes',
  });

  // "Analyse" is where a document gets its score now (spec D3): the menu's
  // "Oceń dla RAG" is gone and upload does not score by default (D1). Only
  // when there is no score yet — an existing one is the baseline the user
  // has been comparing against, and scoring again would move it for no edit.
  let baseScore = payload.baseScore ?? null;
  if (baseScore === null) {
    try {
      baseScore = await scoreDocumentBaseline({
        documentId: payload.documentId,
        orgId: payload.orgId,
        projectId: payload.projectId,
        userId: payload.userId,
      });
    } catch (scoreError) {
      ctx.log.warn(
        `Baseline score failed for document ${payload.documentId}; suggesting without one: ${
          scoreError instanceof Error ? scoreError.message : String(scoreError)
        }`,
      );
    }
  }

  await optimizeDocumentSuggestions({ ...payload, baseScore });

  await sendSuccessNotification({
    content: `Document optimization complete`,
    intlKey: 'document-optimization-complete',
    meta: { forceRefresh: true },
  });
}
