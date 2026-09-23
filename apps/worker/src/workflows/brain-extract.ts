import type { BrainExtractPayload, BrainExtractResult } from '@ragenai/jobs';

import { brainExtract as handler } from '../handlers/brain-extract.js';
import { runOnTemporal } from './temporal-context.js';

export type { BrainExtractPayload };

/** Temporal entry point; the pipeline is in `../handlers`. */
export async function brainExtract(
  payload: BrainExtractPayload,
): Promise<BrainExtractResult> {
  return runOnTemporal(handler, payload);
}
