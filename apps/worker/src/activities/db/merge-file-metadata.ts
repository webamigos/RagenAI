import { db } from '../../services/db';
import { logger } from '../../services/logger';
import { UserFile } from '../../types/UserFile';

/**
 * Merge new keys into the `UserFile.metadata` JSONB column. Existing keys are
 * preserved (e.g. Google Drive import fields), keys in `patch` overwrite or
 * add. Used by the summary generation step at ingest time (ADR-16).
 *
 * Best-effort: failures are logged and swallowed so the workflow can continue
 * — missing summary metadata is a quality regression, not a correctness bug.
 */
export async function mergeFileMetadata({
  fileId,
  orgId,
  patch,
}: {
  fileId: UserFile['id'];
  orgId: UserFile['organizationId'];
  patch: Record<string, unknown>;
}): Promise<void> {
  try {
    // Knex returns the number of affected rows. A zero-row update means the
    // file row was deleted between embedding completion and this metadata
    // merge — likely a race condition or data inconsistency worth surfacing.
    const updatedRows = await db.mergeFileMetadata({
      where: { fileId, orgId },
      patch,
    });
    if (updatedRows === 0) {
      logger.warn(
        { fileId, orgId, patchKeys: Object.keys(patch) },
        'mergeFileMetadata matched no rows — file may have been deleted mid-ingest',
      );
    }
  } catch (err) {
    logger.warn(
      { err, fileId, orgId },
      'Failed to merge file metadata, continuing',
    );
  }
}
