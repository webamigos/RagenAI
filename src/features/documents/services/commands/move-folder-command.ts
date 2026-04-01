'use server';

import db from '@ragenai/prisma-client';

type OperationResult = { success: true } | { success: false; error: string };

export async function moveFolderCommand(
  folderId: number,
  newParentId: number | null,
  organizationId: string,
): Promise<OperationResult> {
  const folder = await db.documentFolder.findFirst({
    where: { id: folderId, organizationId },
  });

  if (!folder) {
    return { success: false, error: 'Folder not found' };
  }

  let newPath = '/';
  if (newParentId !== null) {
    // Prevent moving a folder into itself
    if (newParentId === folderId) {
      return { success: false, error: 'Cannot move a folder into itself' };
    }

    const newParent = await db.documentFolder.findFirst({
      where: { id: newParentId, organizationId },
    });
    if (!newParent) {
      return { success: false, error: 'Target folder not found' };
    }

    // Prevent moving a folder into one of its descendants (circular reference)
    const oldPathPrefix = `${folder.path}${folder.id}/`;
    if (newParent.path.startsWith(oldPathPrefix)) {
      return {
        success: false,
        error: 'Cannot move a folder into its own subfolder',
      };
    }

    newPath = `${newParent.path}${newParent.id}/`;
  }

  const oldPathPrefix = `${folder.path}${folder.id}/`;
  const newPathPrefix = `${newPath}${folder.id}/`;

  try {
    await db.$transaction(async (tx) => {
      // Update the folder itself
      await tx.documentFolder.update({
        where: { id: folderId },
        data: { parentId: newParentId, path: newPath },
      });

      // Update all descendant folders' paths by replacing the old prefix with the new one
      const descendants = await tx.documentFolder.findMany({
        where: {
          organizationId,
          path: { startsWith: oldPathPrefix },
        },
        select: { id: true, path: true },
      });

      for (const descendant of descendants) {
        const updatedPath = descendant.path.replace(
          oldPathPrefix,
          newPathPrefix,
        );
        await tx.documentFolder.update({
          where: { id: descendant.id },
          data: { path: updatedPath },
        });
      }
    });
  } catch {
    return { success: false, error: 'Failed to move folder' };
  }

  return { success: true };
}
