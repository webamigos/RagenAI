import type {
  BrainPublishPagePayload,
  BrainPublishPageResult,
} from '@ragenai/jobs';

import { brainPublishPage as handler } from '../handlers/brain-publish-page.js';
import { runOnTemporal } from './temporal-context.js';

export type { BrainPublishPagePayload };

/** Temporal entry point; the pipeline is in `../handlers`. */
export async function brainPublishPage(
  payload: BrainPublishPagePayload,
): Promise<BrainPublishPageResult> {
  return runOnTemporal(handler, payload);
}
