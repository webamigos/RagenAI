import type { OptimizeDocumentPayload } from '@ragenai/jobs';

import { optimizeDocument as handler } from '../handlers/optimize-document.js';
import { runOnTemporal } from './temporal-context.js';

export type { OptimizeDocumentPayload };

/**
 * The Temporal entry point. The pipeline itself is in `../handlers`, which
 * knows nothing about the engine — see the worker-runtime spec's §2.
 *
 * This file stays because `workflowsPath` bundles a directory of workflow
 * functions into the sandbox, and because the name a producer starts is the
 * name exported here.
 */
export async function optimizeDocument(
  payload: OptimizeDocumentPayload,
): Promise<void> {
  return runOnTemporal(handler, payload);
}
