import {
  BRAIN_EXTRACT_MAX_DOCUMENTS,
  BRAIN_EXTRACT_MAX_TOKENS,
} from '../../consts.js';
import { resolveOrgFeatures } from '../../services/org-features.js';

/**
 * Whether this organization may run Brain now, and the run's ceilings.
 *
 * One activity for both because a handler must not read either itself: on
 * Temporal a handler is workflow code, which cannot touch the environment or
 * the database, and a flag or limit read at enqueue time would be a decision
 * made by whoever queued the job rather than by the organization's settings
 * when it runs. Spec: "every Brain route and job checks it".
 *
 * The precedence is `resolveOrgFeatures`, which is `resolveFeatures` — the
 * function apps/web gates on — fed the same three layers, so the worker and
 * the panel cannot disagree about whether an organization has Brain.
 */
export async function startBrainExtractRun({
  orgId,
}: {
  orgId: string;
}): Promise<{ enabled: boolean; maxDocuments: number; maxTokens: number }> {
  const resolved = await resolveOrgFeatures(orgId);

  return {
    enabled: resolved.brain.value,
    maxDocuments: BRAIN_EXTRACT_MAX_DOCUMENTS,
    maxTokens: BRAIN_EXTRACT_MAX_TOKENS,
  };
}
