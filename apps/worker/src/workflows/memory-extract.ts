import type { MemoryExtractPayload, MemoryExtractResult } from '@ragenai/jobs';

import { memoryExtract as handler } from '../handlers/memory-extract.js';
import { runOnTemporal } from './temporal-context.js';

export type { MemoryExtractPayload };

/** Temporal entry point; the pipeline is in `../handlers`. */
export async function memoryExtract(
  payload: MemoryExtractPayload,
): Promise<MemoryExtractResult> {
  return runOnTemporal(handler, payload);
}
