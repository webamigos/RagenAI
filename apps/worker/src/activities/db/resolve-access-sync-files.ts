import { db } from '../../services/db/index.js';

/**
 * The files an access sync covers: the ones it was told about, plus every file
 * under the folders it was told about.
 *
 * Resolved when the job runs, not when it is queued, so a file moved into the
 * folder in between is covered. The named files are returned as given — the
 * activity that syncs each one reports `missing` for an id that is not in the
 * organization, which keeps that decision in one place.
 */
export async function resolveAccessSyncFiles({
  orgId,
  fileIds = [],
  folderIds = [],
}: {
  orgId: string;
  fileIds?: string[];
  folderIds?: string[];
}): Promise<string[]> {
  const underFolders = await db.getFileIdsUnderFolders(orgId, folderIds);

  return [...new Set([...fileIds, ...underFolders])];
}
