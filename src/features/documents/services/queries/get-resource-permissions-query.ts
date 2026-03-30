'use server';

import db from '@ragenai/prisma-client';
import type {
  DocumentPermissionItem,
  ResourceType,
  GranteeType,
  PermissionLevel,
} from '../../contracts/permission.types';

export async function getFilePermissionsQuery(
  filePublicId: string,
  organizationId: string,
): Promise<DocumentPermissionItem[]> {
  // Verify file belongs to org
  const file = await db.userFile.findFirst({
    where: { publicId: filePublicId, organizationId },
    select: { publicId: true },
  });
  if (!file) {
    return [];
  }

  const permissions = await db.documentPermission.findMany({
    where: {
      resourceType: 'file',
      filePublicId,
    },
    orderBy: { createdAt: 'asc' },
  });

  return resolveGranteeNames(permissions);
}

export async function getFolderPermissionsQuery(
  folderId: number,
  organizationId: string,
): Promise<DocumentPermissionItem[]> {
  // Verify folder belongs to org
  const folder = await db.documentFolder.findFirst({
    where: { id: folderId, organizationId },
    select: { id: true },
  });
  if (!folder) {
    return [];
  }

  const permissions = await db.documentPermission.findMany({
    where: {
      resourceType: 'folder',
      folderId,
    },
    orderBy: { createdAt: 'asc' },
  });

  return resolveGranteeNames(permissions);
}

async function resolveGranteeNames(
  permissions: {
    id: number;
    resourceType: string;
    granteeType: string;
    granteeId: string;
    permission: string;
  }[],
): Promise<DocumentPermissionItem[]> {
  if (permissions.length === 0) {
    return [];
  }

  const userIds = permissions
    .filter((p) => p.granteeType === 'user')
    .map((p) => p.granteeId);
  const teamIds = permissions
    .filter((p) => p.granteeType === 'team')
    .map((p) => p.granteeId);

  const [users, teams] = await Promise.all([
    userIds.length > 0
      ? db.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, name: true, email: true },
        })
      : [],
    teamIds.length > 0
      ? db.team.findMany({
          where: { id: { in: teamIds } },
          select: { id: true, name: true },
        })
      : [],
  ]);

  const userMap = new Map(users.map((u) => [u.id, u]));
  const teamMap = new Map(teams.map((t) => [t.id, t]));

  return permissions.map((p) => {
    const isUser = p.granteeType === 'user';
    const user = isUser ? userMap.get(p.granteeId) : undefined;
    const team = !isUser ? teamMap.get(p.granteeId) : undefined;

    return {
      id: p.id,
      resourceType: p.resourceType as ResourceType,
      granteeType: p.granteeType as GranteeType,
      granteeId: p.granteeId,
      granteeName: user?.name ?? team?.name ?? 'Unknown',
      granteeEmail: user?.email,
      permission: p.permission as PermissionLevel,
    };
  });
}
