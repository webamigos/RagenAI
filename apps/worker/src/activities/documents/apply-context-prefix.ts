import { logger } from '../../services/logger.js';
import { resolveOrgFeatures } from '../../services/org-features.js';
import { withFreeContextPrefix } from '../../services/context-prefix.js';
import type { Document } from '../../types/Document.js';

/**
 * The body chunks with their context prefix, when the organization has
 * `contextualChunks` on — and unchanged when it has not (spec
 * 2026-09-29-contextual-chunks, A2).
 *
 * One activity for the key and the prefix, not a key read in the handler:
 * handlers also run in Temporal's workflow sandbox, which cannot load
 * `@ragenai/rag-core` or the database. The key is read when the job runs, as
 * `isRagScoringEnabled` reads its own, so it is the organization's decision
 * at ingest. A failed read indexes without a prefix: an enrichment must not
 * fail an upload.
 */
export async function applyContextPrefix({
  orgId,
  docs,
  fileName,
  summary,
}: {
  orgId: string;
  docs: Document[];
  fileName: string;
  summary?: string;
}): Promise<Document[]> {
  let enabled: boolean;
  try {
    enabled = (await resolveOrgFeatures(orgId)).contextualChunks.value;
  } catch (err) {
    logger.warn(
      { orgId, err: err instanceof Error ? err.message : String(err) },
      'applyContextPrefix: could not read contextualChunks — indexing without a prefix',
    );
    return docs;
  }
  return enabled ? withFreeContextPrefix(docs, { fileName, summary }) : docs;
}
