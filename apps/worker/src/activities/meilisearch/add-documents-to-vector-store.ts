import { Document } from '../../types/Document';
import { qdrantService } from '../../services/qdrant';
import { logger } from '../../services/logger';

export const addDocumentsToVectorStore = async ({
  orgId,
  projectId,
  userId,
  docs,
}: {
  orgId: string;
  projectId?: string | null;
  userId?: string | null;
  docs: Document[];
}) => {
  try {
    return await qdrantService.addDocuments({ orgId, projectId, userId, docs });
  } catch (error) {
    logger.error(
      { err: error, orgId, docsCount: docs.length },
      'Failed to add documents to vector store',
    );
    throw error;
  }
};
