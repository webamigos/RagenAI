import {
  type BrainExtractPayload,
  type BrainExtractResult,
  type JobContext,
} from '@ragenai/jobs';

import type * as activities from '../activities/index.js';

/**
 * Ragen Brain's extraction run (spec B3): candidate pages from each document,
 * one at a time, until the files or the run's budget run out.
 *
 * The budget is enforced at two call sites, deliberately split: the document
 * count here, before an activity is started, and the tokens inside the
 * activity, before every model call (`extractDocument`). What is left of the
 * tokens is handed down each time, so the ceiling is the run's, not each
 * document's.
 *
 * A document that fails does not fail the run — it raises its own finding and
 * the next document is tried. Only an exhausted budget stops early, and the
 * documents it never reached are counted, so a run that stopped is
 * distinguishable from one that finished.
 */
export async function brainExtract(
  payload: BrainExtractPayload,
  ctx: JobContext,
): Promise<BrainExtractResult> {
  const { startBrainExtractRun, extractDocumentCandidates } = ctx.steps<
    typeof activities
  >({
    retry: {
      initialInterval: '5 seconds',
      maximumInterval: '1 minute',
      backoffCoefficient: 2,
      maximumAttempts: 3,
    },
    startToCloseTimeout: '20 minutes',
  });

  const result: BrainExtractResult = {
    skipped: null,
    extracted: 0,
    failed: 0,
    notAttempted: 0,
    pagesCreated: 0,
    unverifiedClaims: 0,
    tokens: 0,
  };

  const fileIds = [...new Set(payload.fileIds)];
  const run = await startBrainExtractRun({ orgId: payload.orgId });
  if (!run.enabled) {
    ctx.log.info(`brain is off for ${payload.orgId}; nothing extracted`);
    return { ...result, skipped: 'disabled', notAttempted: fileIds.length };
  }

  let attempted = 0;
  let exhausted = false;
  for (const fileId of fileIds) {
    const tokensLeft = run.maxTokens - result.tokens;
    if (exhausted || attempted >= run.maxDocuments || tokensLeft <= 0) {
      result.notAttempted += 1;
      continue;
    }
    attempted += 1;
    ctx.progress(`extracting ${attempted} of ${fileIds.length}`);

    const outcome = await extractDocumentCandidates({
      orgId: payload.orgId,
      fileId,
      userId: payload.userId ?? null,
      maxTokens: tokensLeft,
      runId: ctx.runId,
    });
    result.tokens += outcome.tokens;
    result.unverifiedClaims += outcome.unverifiedClaims;

    if (outcome.status === 'extracted') {
      result.extracted += 1;
      result.pagesCreated += outcome.pagesCreated;
    } else if (outcome.status === 'failed') {
      result.failed += 1;
    } else {
      // Half a document is not returned, so this one counts as not attempted.
      result.notAttempted += 1;
      exhausted = true;
    }
  }

  ctx.log.info(
    `brain extract for ${payload.orgId}: ${result.extracted} extracted, ` +
      `${result.failed} failed, ${result.notAttempted} not attempted, ` +
      `${result.pagesCreated} candidate pages, ${result.tokens} tokens`,
  );
  return result;
}
