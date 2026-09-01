import { qdrantService } from '../../services/qdrant';
import { logger } from '../../services/logger';

/**
 * Clear a file's chunks before re-embedding it.
 *
 * Qdrant point ids are random uuids, so an upsert cannot replace an earlier
 * ingest of the same file — re-embedding without this leaves both versions in
 * the collection.
 */
export const deleteDocumentVectors = async ({
  orgId,
  fileId,
}: {
  orgId: string;
  fileId: string;
}): Promise<void> => {
  try {
    await qdrantService.deleteByFileId({ orgId, fileId });
  } catch (error) {
    logger.error(
      { err: error, orgId, fileId },
      'Failed to delete document chunks from vector store',
    );
    throw error;
  }
};
