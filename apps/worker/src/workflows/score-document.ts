import type { ScoreDocumentPayload } from '@ragenai/jobs';

import { scoreDocument as handler } from '../handlers/score-document.js';
import { runOnTemporal } from './temporal-context.js';

export type { ScoreDocumentPayload };

/** Temporal entry point; the pipeline is in `../handlers`. */
export async function scoreDocument(
  payload: ScoreDocumentPayload,
): Promise<void> {
  return runOnTemporal(handler, payload);
}
