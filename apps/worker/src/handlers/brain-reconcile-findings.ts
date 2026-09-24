import {
  type BrainReconcileFindingsPayload,
  type BrainReconcileFindingsResult,
  type JobContext,
} from '@ragenai/jobs';

import type * as activities from '../activities/index.js';

/**
 * Brain's computed findings for one organization, re-run on demand (spec
 * D2b) — the same `reconcileBrainFindings` step an extraction run ends with.
 *
 * The panel starts it after a review decision, because a new owner or an
 * approval changes what GAP, ORPHAN, STALE and UNOWNED say, and the inbox
 * should not keep a problem open that someone just fixed. Idempotent: a
 * second run over an unchanged organization writes nothing, so a burst of
 * decisions costs a few no-op runs, not wrong rows.
 *
 * The flag is read here, at run time, for the reason `startBrainExtractRun`
 * gives: whoever queued the job does not decide whether Brain is on.
 */
export async function brainReconcileFindings(
  payload: BrainReconcileFindingsPayload,
  ctx: JobContext,
): Promise<BrainReconcileFindingsResult> {
  const { startBrainExtractRun, reconcileBrainFindings } = ctx.steps<
    typeof activities
  >({
    retry: {
      initialInterval: '5 seconds',
      maximumInterval: '1 minute',
      backoffCoefficient: 2,
      maximumAttempts: 3,
    },
    startToCloseTimeout: '5 minutes',
  });

  const run = await startBrainExtractRun({ orgId: payload.orgId });
  if (!run.enabled) {
    ctx.log.info(`brain is off for ${payload.orgId}; findings not reconciled`);
    return { skipped: 'disabled', created: 0, updated: 0, resolved: 0 };
  }
  const written = await reconcileBrainFindings({ orgId: payload.orgId });
  return {
    skipped: null,
    created: written.created,
    updated: written.updated,
    resolved: written.resolved,
  };
}
