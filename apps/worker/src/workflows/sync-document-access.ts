import type {
  SyncDocumentAccessPayload,
  SyncDocumentAccessResult,
} from '@ragenai/jobs';

import { syncDocumentAccess as handler } from '../handlers/sync-document-access.js';
import { runOnTemporal } from './temporal-context.js';

export type { SyncDocumentAccessPayload };

/** Temporal entry point; the pipeline is in `../handlers`. */
export async function syncDocumentAccess(
  payload: SyncDocumentAccessPayload,
): Promise<SyncDocumentAccessResult> {
  return runOnTemporal(handler, payload);
}
