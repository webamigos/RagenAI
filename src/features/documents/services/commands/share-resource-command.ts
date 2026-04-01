'use server';

import db from '@ragenai/prisma-client';
import type {
  PermissionLevel,
  GranteeType,
} from '../../contracts/permission.types';

type ShareFileParams = {
  resourceType: 'file';
  filePublicId: string;
  organizationId: string;
  granteeType: GranteeType;
  granteeId: string;
  permission: PermissionLevel;
  grantedBy: string;
};

type ShareFolderParams = {
  resourceType: 'folder';
  folderId: number;
  organizationId: string;
  granteeType: GranteeType;
  granteeId: string;
  permission: PermissionLevel;
  grantedBy: string;
};

type ShareParams = ShareFileParams | ShareFolderParams;

type OperationResult = { success: true } | { success: false; error: string };

export async function shareResourceCommand(
  params: ShareParams,
): Promise<OperationResult> {
  const {
    resourceType,
    granteeType,
    granteeId,
    permission,
    grantedBy,
    organizationId,
  } = params;

  // Validate grantee exists
  if (granteeType === 'user') {
    const member = await db.member.findFirst({
      where: { userId: granteeId, organizationId },
    });
    if (!member) {
      return {
        success: false,
        error: 'User is not a member of this organization',
      };
    }
  } else {
    const team = await db.team.findFirst({
      where: { id: granteeId, organizationId },
    });
    if (!team) {
      return { success: false, error: 'Team not found in this organization' };
    }
  }

  // Validate resource exists
  if (resourceType === 'file') {
    const file = await db.userFile.findFirst({
      where: { publicId: params.filePublicId, organizationId },
    });
    if (!file) {
      return { success: false, error: 'File not found' };
    }
  } else {
    const folder = await db.documentFolder.findFirst({
      where: { id: params.folderId, organizationId },
    });
    if (!folder) {
      return { success: false, error: 'Folder not found' };
    }
  }

  // Upsert permission
  const data = {
    resourceType,
    filePublicId: resourceType === 'file' ? params.filePublicId : null,
    folderId: resourceType === 'folder' ? params.folderId : null,
    granteeType,
    granteeId,
    permission,
    grantedBy,
  };

  if (resourceType === 'file') {
    await db.documentPermission.upsert({
      where: {
        resourceType_filePublicId_granteeType_granteeId: {
          resourceType,
          filePublicId: params.filePublicId,
          granteeType,
          granteeId,
        },
      },
      create: data,
      update: { permission },
    });
  } else {
    await db.documentPermission.upsert({
      where: {
        resourceType_folderId_granteeType_granteeId: {
          resourceType,
          folderId: params.folderId,
          granteeType,
          granteeId,
        },
      },
      create: data,
      update: { permission },
    });
  }

  return { success: true };
}
