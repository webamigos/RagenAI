import type { ReindexDocumentVersionPayload } from '@ragenai/jobs';

import { reindexDocumentVersion as handler } from '../handlers/reindex-document-version.js';
import { runOnTemporal } from './temporal-context.js';

export type { ReindexDocumentVersionPayload };

/** Temporal entry point; the pipeline is in `../handlers`. */
export async function reindexDocumentVersion(
  payload: ReindexDocumentVersionPayload,
): Promise<string> {
  return runOnTemporal(handler, payload);
}
