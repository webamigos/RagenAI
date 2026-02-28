'use server';

import db from '@ragenai/prisma-client';

type OperationResult = { success: true } | { success: false; error: string };

export async function deleteFolderCommand(
  folderId: string,
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
      // Unassign files from this folder before deleting
      await tx.userFile.updateMany({
        where: { folder_id: folderId },
        data: { folder_id: null },
      });

      await tx.documentFolder.delete({
        where: { id: folderId },
      });
    });
  } catch {
    return { success: false, error: 'Failed to delete folder' };
  }

  return { success: true };
}
