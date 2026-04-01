'use server';

import db from '@ragenai/prisma-client';

type OperationResult = { success: true } | { success: false; error: string };

export async function moveFileToFolderCommand(
  filePublicId: string,
  folderId: number | null,
  organizationId: string,
): Promise<OperationResult> {
  const file = await db.userFile.findFirst({
    where: { publicId: filePublicId, organizationId: organizationId },
    select: { id: true },
  });

  if (!file) {
    return { success: false, error: 'File not found' };
  }

  if (folderId) {
    const folder = await db.documentFolder.findFirst({
      where: { id: folderId, organizationId },
    });
    if (!folder) {
      return { success: false, error: 'Folder not found' };
    }
  }

  await db.userFile.update({
    where: { id: file.id },
    data: { folderId: folderId },
  });

  return { success: true };
}
