'use server';

import db from '@ragenai/prisma-client';

type OperationResult = { success: true } | { success: false; error: string };

export async function revokeProjectShareCommand(
  permissionId: number,
  organizationId: string,
): Promise<OperationResult> {
  const permission = await db.projectPermission.findUnique({
    where: { id: permissionId },
    include: { project: { select: { organizationId: true } } },
  });

  if (!permission || permission.project.organizationId !== organizationId) {
    return { success: false, error: 'Permission not found' };
  }

  await db.projectPermission.delete({ where: { id: permissionId } });

  return { success: true };
}
