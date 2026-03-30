'use server';

import db from '@ragenai/prisma-client';

type OperationResult = { success: true } | { success: false; error: string };

export async function revokeShareCommand(
  permissionId: number,
  organizationId: string,
): Promise<OperationResult> {
  // Verify the permission belongs to this organization by checking the resource
  const permission = await db.documentPermission.findUnique({
    where: { id: permissionId },
    include: {
      file: { select: { organizationId: true } },
      folder: { select: { organizationId: true } },
    },
  });

  if (!permission) {
    return { success: false, error: 'Permission not found' };
  }

  const resourceOrgId =
    permission.file?.organizationId ?? permission.folder?.organizationId;
  if (resourceOrgId !== organizationId) {
    return { success: false, error: 'Permission not found' };
  }

  await db.documentPermission.delete({
    where: { id: permissionId },
  });

  return { success: true };
}
