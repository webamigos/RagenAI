import { resolveOrgFeatures } from '../../services/org-features.js';

/**
 * Whether this organization's documents get a RAG readiness score — the
 * `ragReadinessScore` feature key, on unless an operator turns it off in
 * apps/admin.
 *
 * `stage: 'ingest'` asks the narrower question: whether upload and re-process
 * score automatically. That also needs `ragScoreOnIngest`, off by default
 * (spec D1): the score is kept for "Score for RAG" and the Optimize tab, where
 * it sits beside an edit, rather than spent on every file.
 *
 * An activity, read when the job runs rather than when it was queued, for the
 * reason `startBrainExtractRun` gives: a handler on Temporal cannot touch the
 * database, and a flag read at enqueue time is the decision of whoever queued
 * the job. Spec 2026-09-26-rag-readiness-score-review, Q6.
 */
export async function isRagScoringEnabled({
  orgId,
  stage = 'on-demand',
}: {
  orgId: string;
  stage?: 'ingest' | 'on-demand';
}): Promise<boolean> {
  const resolved = await resolveOrgFeatures(orgId);
  if (!resolved.ragReadinessScore.value) {
    return false;
  }
  return stage === 'ingest' ? resolved.ragScoreOnIngest.value : true;
}
