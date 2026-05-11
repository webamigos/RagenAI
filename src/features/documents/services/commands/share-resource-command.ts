'use server';

import db from '@ragenai/prisma-client';
import type {
  PermissionLevel,
  GranteeType,
} from '../../contracts/permission.types';
import { sendNotificationToUser } from '@/features/notifications/utils/send-notification-to-user';

type ShareFileParams = {
  resourceType: 'file';
  fileId: string;
  organizationId: string;
  granteeType: GranteeType;
  granteeId: string;
  permission: PermissionLevel;
  grantedBy: string;
};

type ShareFolderParams = {
  resourceType: 'folder';
  folderId: string;
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
  let resourceName: string | undefined;
  if (resourceType === 'file') {
    const file = await db.userFile.findFirst({
      where: { id: params.fileId, organizationId },
    });
    if (!file) {
      return { success: false, error: 'File not found' };
    }
    resourceName = file.fileName;
  } else {
    const folder = await db.documentFolder.findFirst({
      where: { id: params.folderId, organizationId },
    });
    if (!folder) {
      return { success: false, error: 'Folder not found' };
    }
    resourceName = folder.name;
  }

  // Upsert permission
  const data = {
    resourceType,
    fileId: resourceType === 'file' ? params.fileId : null,
    folderId: resourceType === 'folder' ? params.folderId : null,
    granteeType,
    granteeId,
    permission,
    grantedBy,
  };

  if (resourceType === 'file') {
    await db.documentPermission.upsert({
      where: {
        resourceType_fileId_granteeType_granteeId: {
          resourceType,
          fileId: params.fileId,
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

  if (granteeType === 'user') {
    const resourceUrl =
      resourceType === 'file'
        ? `/knowledge/documents-list?fileId=${params.fileId}`
        : `/knowledge/documents-list`;
    sendNotificationToUser(granteeId, organizationId, 'DOCUMENT_SHARED', {
      title: 'Udostępniono Ci dokument',
      body: resourceName,
      resourceUrl,
    }).catch(() => {});
  }

  return { success: true };
}
