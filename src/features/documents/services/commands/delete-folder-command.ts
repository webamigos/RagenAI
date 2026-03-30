'use server';

import db from '@ragenai/prisma-client';

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
    await db.$transaction(async (tx) => {
      // Find all descendant folder IDs using materialized path
      const descendantFolders = await tx.documentFolder.findMany({
        where: {
          organizationId,
          path: { startsWith: `${folder.path}${folder.id}/` },
        },
        select: { id: true },
      });
      const allFolderIds = [folderId, ...descendantFolders.map((f) => f.id)];

      // Unassign files from this folder and all descendants
      await tx.userFile.updateMany({
        where: { folderId: { in: allFolderIds } },
        data: { folderId: null },
      });

      // Delete all descendant folders first (Prisma handles cascade,
      // but explicit deletion is clearer for descendants found via path)
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
  } catch {
    return { success: false, error: 'Failed to delete folder' };
  }

  return { success: true };
}
