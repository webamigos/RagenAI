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
 * the next document is tried. That holds for a step that throws through its
 * retries too (spec C3): the error is reduced to its class name and recorded
 * as the document's `EXTRACTION_FAILED`. Only an exhausted budget stops
 * early, and the documents it never reached are counted, so a run that
 * stopped is distinguishable from one that finished.
 *
 * The run ends with two passes over the whole organization. The pages this
 * run wrote are compared with every other page on the same subject (spec
 * C1), on what is left of the run's tokens; then the computed findings are
 * reconciled (C2) — new pages change what is orphaned and unowned. A failure
 * in either is logged and reported as `null`, never a failed run: the
 * candidates are written by then, and the next run tries again.
 */
export async function brainExtract(
  payload: BrainExtractPayload,
  ctx: JobContext,
): Promise<BrainExtractResult> {
  const {
    startBrainExtractRun,
    recordExtractionStepFailed,
    reconcileBrainFindings,
  } = ctx.steps<typeof activities>({
    retry: {
      initialInterval: '5 seconds',
      maximumInterval: '1 minute',
      backoffCoefficient: 2,
      maximumAttempts: 3,
    },
    startToCloseTimeout: '20 minutes',
  });
  // The two steps that call the model run once. A retry would re-run every
  // call from the start with the same `maxTokens`, and what the failed
  // attempt spent never reaches `result.tokens` — so one document could cost
  // three times its share, outside the run's ceiling. Provider errors are
  // already a `failed` document inside the step; a step that still throws is
  // recorded as the document's EXTRACTION_FAILED below, and D3's retry is the
  // person's way to try again.
  const { extractDocumentCandidates, detectContradictions } = ctx.steps<
    typeof activities
  >({
    retry: { maximumAttempts: 1 },
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
    contradictions: null,
    findings: null,
  };

  const fileIds = [...new Set(payload.fileIds)];
  const run = await startBrainExtractRun({ orgId: payload.orgId });
  if (!run.enabled) {
    ctx.log.info(`brain is off for ${payload.orgId}; nothing extracted`);
    return { ...result, skipped: 'disabled', notAttempted: fileIds.length };
  }

  let attempted = 0;
  let exhausted = false;
  const extractedFileIds: string[] = [];
  const notReached: string[] = [];
  for (const fileId of fileIds) {
    const tokensLeft = run.maxTokens - result.tokens;
    if (exhausted || attempted >= run.maxDocuments || tokensLeft <= 0) {
      result.notAttempted += 1;
      notReached.push(fileId);
      continue;
    }
    attempted += 1;
    ctx.progress(`extracting ${attempted} of ${fileIds.length}`);

    let outcome: Awaited<ReturnType<typeof extractDocumentCandidates>>;
    try {
      outcome = await extractDocumentCandidates({
        orgId: payload.orgId,
        fileId,
        userId: payload.userId ?? null,
        maxTokens: tokensLeft,
        runId: ctx.runId,
      });
    } catch (error) {
      // What the step spent before it threw is not known here, so it is not
      // charged — the AI-usage rows it wrote are the record of it.
      await recordExtractionStepFailed({
        orgId: payload.orgId,
        fileId,
        runId: ctx.runId,
        reason: stepFailureReason(error),
      });
      result.failed += 1;
      continue;
    }
    result.tokens += outcome.tokens;
    result.unverifiedClaims += outcome.unverifiedClaims;

    if (outcome.status === 'extracted') {
      result.extracted += 1;
      extractedFileIds.push(fileId);
      result.pagesCreated += outcome.pagesCreated;
    } else if (outcome.status === 'failed') {
      result.failed += 1;
    } else {
      // Half a document is not returned, so this one counts as not attempted.
      result.notAttempted += 1;
      notReached.push(fileId);
      exhausted = true;
    }
  }

  // A document the run's limits stopped before is said where a person looks:
  // as that document's finding, with the retry the panel already offers. In
  // the job result alone it stayed "Not extracted" while the start toast had
  // promised candidates.
  for (const fileId of notReached) {
    await recordExtractionStepFailed({
      orgId: payload.orgId,
      fileId,
      runId: ctx.runId,
      reason: `the run reached its limit (${run.maxDocuments} documents, ${run.maxTokens} tokens) before this document — extract it again`,
    });
  }

  const tokensLeft = run.maxTokens - result.tokens;
  if (extractedFileIds.length > 0 && tokensLeft > 0) {
    try {
      const { tokens, ...counts } = await detectContradictions({
        orgId: payload.orgId,
        fileIds: extractedFileIds,
        userId: payload.userId ?? null,
        maxTokens: tokensLeft,
        runId: ctx.runId,
      });
      result.tokens += tokens;
      result.contradictions = counts;
    } catch (error) {
      ctx.log.warn(
        `brain contradictions for ${payload.orgId} not checked: ${stepFailureReason(error)}`,
      );
    }
  }

  try {
    const { created, updated, resolved } = await reconcileBrainFindings({
      orgId: payload.orgId,
    });
    result.findings = { created, updated, resolved };
  } catch (error) {
    ctx.log.warn(
      `brain findings for ${payload.orgId} not reconciled: ${stepFailureReason(error)}`,
    );
  }

  ctx.log.info(
    `brain extract for ${payload.orgId}: ${result.extracted} extracted, ` +
      `${result.failed} failed, ${result.notAttempted} not attempted, ` +
      `${result.pagesCreated} candidate pages, ${result.tokens} tokens`,
  );
  return result;
}

/**
 * A failed step, as a finding may carry it: the class name and nothing else.
 * An error from a model call carries the request — the document — in its
 * message and its properties, and a finding is read by people. Inline rather
 * than `brain-core`'s `describeFailure` because this module is workflow code
 * on Temporal, where that package's `node:crypto` import is not allowed.
 */
function stepFailureReason(error: unknown): string {
  const name =
    error instanceof Error && error.name ? error.name : 'unknown error';
  return `the extraction step failed (${name})`;
}
