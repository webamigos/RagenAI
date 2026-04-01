'use server';

import db from '@ragenai/prisma-client';
import { deleteFromS3, deleteFromS3ByKey } from '@/app/lib/services/aws';
import { deleteFileFromVectorStore } from '@/app/api/upload/services/TableService';
import { getDocumentByPublicIdQuery as getDocumentByPublicId } from '@/features/documents/services/queries/get-document-query';
import { deleteDocumentFromDbCommand as deleteDocumentFromDb } from '@/features/documents/services/commands/update-document-command';
import { getOrganizationFilesCountQuery as getOrganizationFilesCount } from '@/features/documents/services/queries/get-file-details-query';
import { saveOrganizationPublicMetadataCommand } from '@/features/organizations/services/commands/save-organization-metadata-command';
import { getFileExtension } from '@/app/lib/utils/getFileExtension';
import { trackAudit } from '@/features/audit-logs/services/commands/create-audit-log-command';
import { logger } from '@/app/lib/utils/logger';

type OperationResult = { success: true } | { success: false; error: string };

export async function deleteFolderCommand(
  folderId: number,
  organizationId: string,
): Promise<OperationResult> {
  const folder = await db.documentFolder.findFirst({
    where: { id: folderId, organizationId },
  });

  if (!folder) {
    return { success: false, error: 'Folder not found' };
  }

  try {
    // Find all descendant folder IDs using materialized path
    const descendantFolders = await db.documentFolder.findMany({
      where: {
        organizationId,
        path: { startsWith: `${folder.path}${folder.id}/` },
      },
      select: { id: true },
    });
    const allFolderIds = [folderId, ...descendantFolders.map((f) => f.id)];

    // Find all files in the folder tree
    const files = await db.userFile.findMany({
      where: { folderId: { in: allFolderIds } },
      select: {
        id: true,
        publicId: true,
        fileName: true,
        documentId: true,
        thumbnailS3Key: true,
      },
    });

    // Delete files from S3 and vector store (best-effort, outside transaction)
    for (const file of files) {
      try {
        const s3Path = `${file.publicId}.${getFileExtension(file.fileName)}`;
        await deleteFromS3(s3Path);
      } catch (err) {
        logger.error(
          { err, fileId: file.publicId },
          'Failed to delete file from S3 during folder deletion',
        );
      }

      if (file.thumbnailS3Key) {
        try {
          await deleteFromS3ByKey(file.thumbnailS3Key);
        } catch {
          // Thumbnail cleanup is non-critical
        }
      }

      try {
        await deleteFileFromVectorStore(file.id);
      } catch (err) {
        logger.error(
          { err, fileId: file.publicId },
          'Failed to delete file from vector store during folder deletion',
        );
      }

      if (file.documentId) {
        try {
          const doc = await getDocumentByPublicId(file.documentId);
          if (doc) {
            await deleteDocumentFromDb(doc.id);
          }
        } catch (err) {
          logger.error(
            { err, fileId: file.publicId },
            'Failed to delete UserDocument during folder deletion',
          );
        }
      }

      await trackAudit({
        action: 'document.deleted',
        entityType: 'document',
        entityId: file.publicId,
      });
    }

    // Delete files and folders from database in a transaction
    await db.$transaction(async (tx) => {
      // Delete files from DB
      if (files.length > 0) {
        await tx.userFile.deleteMany({
          where: { folderId: { in: allFolderIds } },
        });
      }

      // Delete descendant folders
      if (descendantFolders.length > 0) {
        await tx.documentFolder.deleteMany({
          where: { id: { in: descendantFolders.map((f) => f.id) } },
        });
      }

      // Delete the folder itself
      await tx.documentFolder.delete({
        where: { id: folderId },
      });
    });

    // Update org metadata if no files remain
    const remainingCount = await getOrganizationFilesCount(organizationId);
    if (remainingCount === 0) {
      await saveOrganizationPublicMetadataCommand(organizationId, {
        hasKnowledge: false,
      });
    }
  } catch (err) {
    logger.error({ err, folderId }, 'Failed to delete folder');
    return { success: false, error: 'Failed to delete folder' };
  }

  return { success: true };
}
