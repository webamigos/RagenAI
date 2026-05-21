'use server';

import db from '@ragenai/prisma-client';
import { logger } from '@/app/lib/utils/logger';
import { requireProjectAccess } from '../utils/require-project-access';

/**
 * Hard-deletes a project and DB-side related rows.
 *
 * Note: S3 blobs and Qdrant vectors for the project's files are NOT cleaned up
 * here — that's intentional follow-up work. Orphaned blobs/vectors are harmless
 * because the references in Postgres are gone after this call.
 */
export async function deleteProjectCommand(
  projectId: string,
): Promise<{ success: boolean }> {
  try {
    await requireProjectAccess(projectId, 'owner');

    await db.$transaction(async (tx) => {
      // AiUsage.projectId is nullable but has no onDelete — null it out for analytics retention.
      await tx.aiUsage.updateMany({
        where: { projectId },
        data: { projectId: null },
      });

      // The remaining models referencing Project (threads, files, documents) have no
      // ON DELETE cascade, so we delete them explicitly. Messages, threadDocuments,
      // and threadShares cascade off Thread.
      await tx.thread.deleteMany({ where: { projectId } });
      await tx.userDocument.deleteMany({ where: { projectId } });
      await tx.userFile.deleteMany({ where: { projectId } });

      await tx.project.delete({ where: { id: projectId } });
    });

    return { success: true };
  } catch (error) {
    logger.error({ err: error, projectId }, 'Error deleting project');
    throw error;
  }
}
