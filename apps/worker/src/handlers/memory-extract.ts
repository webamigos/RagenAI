import type {
  JobContext,
  MemoryExtractPayload,
  MemoryExtractResult,
} from '@ragenai/jobs';

import type * as activities from '../activities/index.js';

/**
 * A user's personal memories from one chat turn (spec
 * 2026-09-27-personal-memory-across-threads, C1). Everything happens in one
 * step — see `runMemoryExtraction` — so the decrypted question and memories
 * never become a step result a runtime would store.
 *
 * Retried a couple of times on a transient failure (the model, the
 * database). An unparseable answer is not retried: it is a no-op.
 */
export async function memoryExtract(
  payload: MemoryExtractPayload,
  ctx: JobContext,
): Promise<MemoryExtractResult> {
  const { runMemoryExtraction } = ctx.steps<typeof activities>({
    retry: {
      initialInterval: '10 seconds',
      maximumInterval: '1 minute',
      backoffCoefficient: 2,
      maximumAttempts: 3,
    },
    startToCloseTimeout: '2 minutes',
  });
  return runMemoryExtraction(payload);
}
