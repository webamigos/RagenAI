import { db } from '../../services/db/db';
import { logger } from '../../services/logger';

export async function syncRagScoreToVersion({
  documentId,
  ragScore,
}: {
  documentId: string;
  ragScore: Record<string, unknown>;
}): Promise<void> {
  try {
    const updated = await db.updateActiveDocumentVersionRagScore({
      documentId,
      ragScore,
    });
    if (updated === 0) {
      logger.warn(
        { documentId },
        'syncRagScoreToVersion: no active version found',
      );
    }
  } catch (err) {
    logger.warn(
      { err, documentId },
      'syncRagScoreToVersion failed — continuing',
    );
  }
}
