import { resolveOrgFeatures } from '../../services/org-features.js';

/**
 * Whether this organization's documents get a RAG readiness score — the
 * `ragReadinessScore` feature key, on unless an operator turns it off in
 * apps/admin.
 *
 * An activity, read when the job runs rather than when it was queued, for the
 * reason `startBrainExtractRun` gives: a handler on Temporal cannot touch the
 * database, and a flag read at enqueue time is the decision of whoever queued
 * the job. Spec 2026-09-26-rag-readiness-score-review, Q6.
 */
export async function isRagScoringEnabled({
  orgId,
}: {
  orgId: string;
}): Promise<boolean> {
  const resolved = await resolveOrgFeatures(orgId);
  return resolved.ragReadinessScore.value;
}
