import { detectPageFindings, reconcileFindings } from '@ragenai/brain-core';

import {
  applyFindingsPlan,
  loadComputedFindings,
  loadFindingsSnapshot,
} from '../../services/db/brain-findings.js';

export type ReconcileBrainFindingsResult = {
  created: number;
  updated: number;
  resolved: number;
  /** The computed findings that hold now, dismissed ones included. */
  holding: number;
};

/**
 * Bring the organization's GAP, ORPHAN, STALE and UNOWNED findings in line
 * with its pages (spec C2).
 *
 * The findings are a query over the pages' own fields, and this is where the
 * query runs: read a snapshot, let `detectPageFindings` say what holds, let
 * `reconcileFindings` diff that against the stored rows, write the diff. Run
 * at the end of every extraction run, and idempotent — a second run over an
 * unchanged organization writes nothing.
 *
 * `now` is read here rather than in the rule so the rule stays a pure
 * function of its inputs and its tests need no clock.
 */
export async function reconcileBrainFindings({
  orgId,
}: {
  orgId: string;
}): Promise<ReconcileBrainFindingsResult> {
  const [snapshot, existing] = await Promise.all([
    loadFindingsSnapshot(orgId),
    loadComputedFindings(orgId),
  ]);
  const desired = detectPageFindings(snapshot, new Date());
  const written = await applyFindingsPlan(
    orgId,
    reconcileFindings(desired, existing),
  );
  return { ...written, holding: desired.length };
}
