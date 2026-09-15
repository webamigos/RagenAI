import type {
  GenerateDocumentPayload,
  GenerateDocumentResult,
} from '@ragenai/jobs';

import { generateDocument as handler } from '../handlers/generate-document.js';
import { runOnTemporal } from './temporal-context.js';

export type { GenerateDocumentPayload, GenerateDocumentResult };

/** Temporal entry point; the pipeline is in `../handlers`. */
export async function generateDocument(
  payload: GenerateDocumentPayload,
): Promise<GenerateDocumentResult> {
  return runOnTemporal(handler, payload);
}
