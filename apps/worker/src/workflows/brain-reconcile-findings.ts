import type {
  BrainReconcileFindingsPayload,
  BrainReconcileFindingsResult,
} from '@ragenai/jobs';

import { brainReconcileFindings as handler } from '../handlers/brain-reconcile-findings.js';
import { runOnTemporal } from './temporal-context.js';

export type { BrainReconcileFindingsPayload };

/** Temporal entry point; the pipeline is in `../handlers`. */
export async function brainReconcileFindings(
  payload: BrainReconcileFindingsPayload,
): Promise<BrainReconcileFindingsResult> {
  return runOnTemporal(handler, payload);
}
