import { computeAccessiblePrincipals } from '@ragenai/rag-core';

import { db } from '../../services/db/index.js';

/**
 * Who may retrieve this file's chunks, as `org:`/`user:`/`team:` principals.
 *
 * Written into `metadata.accessible_by` at ingest. Until this existed nothing
 * wrote the field at all: the worker created a payload *index* on it, apps/web
 * and apps/api each had a `computeAccessibleBy` that only ran on a permission
 * change, and a document ingested through the public API therefore carried no
 * principals. `buildMetadataFilter` asks for that field at any scope below
 * `organization`, so the document was unretrievable — the assistant answered
 * "I don't know" about a file it had just reported as processed.
 *
 * A file the lookup cannot find yields no principals rather than a permissive
 * default: a chunk nobody may reach is recoverable, a chunk everybody may
 * reach is a leak.
 */
export async function computeFileAccessPrincipals(
  fileId: string,
  orgId: string,
): Promise<string[]> {
  const rows = await db.getFileAccessRows(fileId, orgId);

  if (!rows) {
    return [];
  }

  return computeAccessiblePrincipals({
    organizationId: orgId,
    ownerId: rows.ownerId,
    isOrgWide: rows.isOrgWide,
    folderTeamId: rows.folderTeamId,
    grants: rows.grants,
  });
}
