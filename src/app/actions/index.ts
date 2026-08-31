'use server';

import { StatusCodes } from 'http-status-codes';
import {
  getOrgIdFromAuthOrThrow,
  getOrgIdFromAuth,
  getCurrentUser,
} from '../lib/utils/auth-helpers';

import { getFileDetailsByIdQuery as getFileDetailsById } from '@/features/documents/services/queries/get-file-details-query';
import { getOrganizationFilesCountQuery as getOrganizationFilesCount } from '@/features/documents/services/queries/get-file-details-query';
import { getUserFilesQuery as fetchFilesDetails } from '@/features/documents/services/queries/get-user-files-query';
import { deleteFileCommand } from '@/features/documents/services/commands/delete-file-command';
import { reembedFileCommand } from '@/features/documents/services/commands/reembed-file-command';
import type { RegenerateData } from '@/features/messages/services/commands/regenerate-assistant-message-command';
import type { OperationResult } from '@/types/common';
import { saveOrganizationPublicMetadataCommand } from '@/features/organizations/services/commands/save-organization-metadata-command';
import { logger } from '../lib/utils/logger';
import { getAccountSetupStatusQuery as getAccountSetupStatus } from '@/features/organizations/services/queries/get-account-setup-query';
import { getOrgIdFromAuthOrThrow as getOrgIdOrThrow } from '../lib/utils/auth-helpers';
import {
  getUserTeamIds,
  getActiveMember,
  requireOrgAdmin,
} from '@/lib/auth-guards';
import { isOrgAdmin } from '@/lib/auth-access-control';
import { getProjectStorageUsageQuery } from '@/features/organizations/services/queries/get-storage-usage-query';
import {
  getStorageLimits,
  getPiiIngestionMode,
  savePiiIngestionMode,
} from '@/features/organizations/services/organization-settings';
import type { PiiIngestionMode } from '@/features/organizations/contracts/organization.types';
import { defaultStorageLimits } from '@/features/organizations/constants/settings';
import { getProjectByIdOrThrowQuery as getProjectByIdOrThrow } from '@/features/projects/services/queries/get-project-query';
import { ragenApiRequest } from '@/libs/ragen-api-client/client';
import type { NotificationDto } from '@/features/notifications/contracts/notification.types';
import type { NotificationType } from '@/generated/prisma/client';
import type { Project, UserFile } from '@/generated/prisma/client';
import { PiiPolicy } from '@/generated/prisma/client';
import db from '@ragenai/prisma-client';

//get user documents
export const getUserFiles = async (options?: {
  folderId?: string | null;
  viewMode?: 'all' | 'my-files' | 'shared-with-me';
}) => {
  try {
    const orgId = await getOrgIdOrThrow();
    const user = await getCurrentUser();
    const userId = user?.id;
    const [teamIds, member] = await Promise.all([
      userId ? getUserTeamIds(orgId, userId) : [],
      userId ? getActiveMember(orgId) : null,
    ]);
    const result = await fetchFilesDetails(orgId, teamIds, {
      userId: userId ?? undefined,
      isOrgAdmin: member ? isOrgAdmin(member.role) : false,
      folderId: options?.folderId,
      viewMode: options?.viewMode,
    });
    return { files: result.items };
  } catch (error) {
    return {
      error: 'Fetching documents details failed',
      status: StatusCodes.BAD_REQUEST,
    };
  }
};

type OrgFileItem = {
  id: string;
  fileName: string;
  fileSize: number;
  fileType: import('@/generated/prisma/client').FileType;
  createdAt: Date;
  folderId: string | null;
  ownerId: string | null;
  piiPolicy: PiiPolicy;
  project: { id: string; title: string } | null;
  folder: { id: string; name: string; teamId: string | null } | null;
  owner: { name: string | null } | null;
};

// Get all organization files (for knowledge base picker)
export const getAllOrgFiles = async () => {
  try {
    const orgId = await getOrgIdOrThrow();
    const user = await getCurrentUser();
    const userId = user?.id;
    if (!userId) {
      return { files: [] };
    }
    const files = await ragenApiRequest<OrgFileItem[]>({
      method: 'GET',
      path: '/v1/internal/files/all-org',
      userId,
      orgId,
    });
    return { files };
  } catch {
    return { files: [] };
  }
};

// Get project storage info (usage + limits)
export const getProjectStorageInfo = async (projectId: Project['id']) => {
  try {
    const orgId = await getOrgIdOrThrow();
    const project = await getProjectByIdOrThrow(projectId);
    const [usage, limits] = await Promise.all([
      getProjectStorageUsageQuery(orgId, project.id),
      getStorageLimits(orgId),
    ]);
    return {
      usedBytes: usage.totalBytes,
      limitBytes: limits.projectStorageLimitBytes,
      singleFileLimitBytes: limits.singleFileLimitBytes,
    };
  } catch {
    return {
      usedBytes: 0,
      limitBytes: defaultStorageLimits.projectStorageLimitBytes,
      singleFileLimitBytes: defaultStorageLimits.singleFileLimitBytes,
    };
  }
};

// Import files from knowledge base to a project
export const importFilesToProject = async (
  fileIds: string[],
  targetProjectId: string,
) => {
  const orgId = await getOrgIdOrThrow();
  const user = await getCurrentUser();
  if (!user) {
    return {
      results: fileIds.map((fileId) => ({
        fileId,
        success: false,
        alreadyExists: false,
      })),
    };
  }

  const results = [];
  for (const fileId of fileIds) {
    try {
      const result = await ragenApiRequest<{ alreadyExists: boolean }>({
        method: 'POST',
        path: `/v1/internal/files/${encodeURIComponent(fileId)}/import-to-project`,
        userId: user.id,
        orgId,
        body: { targetProjectId },
      });
      results.push({
        fileId,
        success: true,
        alreadyExists: result.alreadyExists,
      });
    } catch {
      results.push({ fileId, success: false, alreadyExists: false });
    }
  }
  return { results };
};

// Get file details for download
export const getFileDetailsForDownload = async (fileId: string) => {
  try {
    const fileRecord = await getFileDetailsById(fileId);
    if (!fileRecord) {
      return {
        error: 'File not found',
        status: StatusCodes.NOT_FOUND,
      };
    }

    return {
      success: true,
      fileDetails: fileRecord,
    };
  } catch (error) {
    return {
      error: `Error retrieving file details: ${error}`,
      status: StatusCodes.BAD_REQUEST,
    };
  }
};

// Delete project file
export const deleteProjectFileAction = async (
  fileId: UserFile['id'],
  projectId: Project['id'],
) => {
  try {
    const orgId = await getOrgIdOrThrow();
    const result = await deleteFileCommand({
      fileId,
      organizationId: orgId,
      projectId,
    });

    if (!result.deleted) {
      return {
        error: 'File not found',
        status: StatusCodes.NOT_FOUND,
      };
    }

    return {
      success: true,
      count: 1,
    };
  } catch (error) {
    return {
      error: `Failed to delete project file: ${error}`,
      status: StatusCodes.BAD_REQUEST,
    };
  }
};

//remove user file
export const deleteFileAction = async (fileId: UserFile['id']) => {
  try {
    const orgId = await getOrgIdOrThrow();
    const result = await deleteFileCommand({ fileId, organizationId: orgId });

    if (!result.deleted) {
      return {
        error:
          'Document not found or user does not have permission to delete it',
        status: StatusCodes.NOT_FOUND,
      };
    }

    // Clear the org-level hasKnowledge flag when the last file goes
    // away so onboarding surfaces re-appear.
    const documentCount = await getOrganizationFilesCount(orgId);
    if (documentCount === 0) {
      await saveOrganizationPublicMetadataCommand(orgId, {
        hasKnowledge: false,
      });
    }

    return {
      message: 'Document deleted successfully',
      status: StatusCodes.OK,
    };
  } catch (error) {
    logger.error({ err: error }, 'Error deleting document');
    return {
      error: 'Failed to delete document',
      status: StatusCodes.INTERNAL_SERVER_ERROR,
    };
  }
};

export const getDefaultProjectId = async () => {
  const [orgId, user] = await Promise.all([
    getOrgIdFromAuthOrThrow(),
    getCurrentUser(),
  ]);

  try {
    const result = await ragenApiRequest<{ projectId: string | null }>({
      method: 'GET',
      path: '/v1/internal/projects/default',
      userId: user?.id ?? '',
      orgId,
    });
    return result.projectId;
  } catch (error) {
    logger.error({ err: error }, 'Error fetching default project ID');
    throw error;
  }
};

export const getAccountSetupStatusAction = async () => {
  try {
    // Get userId from Better Auth
    const user = await getCurrentUser();
    const userId = user?.id;

    if (!userId) {
      logger.warn('No user found in getAccountSetupStatusAction');
      throw new Error('User not authenticated');
    }

    return await getAccountSetupStatus(userId);
  } catch (error) {
    logger.error({ err: error }, 'Error fetching account setup status');
    throw error;
  }
};

export async function regenerateLastAssistantMessage(
  threadId: string,
): Promise<OperationResult<RegenerateData>> {
  const orgId = await getOrgIdFromAuthOrThrow();
  const user = await getCurrentUser();
  return ragenApiRequest<OperationResult<RegenerateData>>({
    method: 'POST',
    path: `/v1/internal/threads/${encodeURIComponent(threadId)}/regenerate-last-message`,
    userId: user?.id ?? '',
    orgId,
  });
}

export async function getNotificationsAction(params: {
  isRead?: boolean;
  type?: NotificationType;
  cursor?: string;
  limit?: number;
}) {
  const [user, orgId] = await Promise.all([
    getCurrentUser(),
    getOrgIdFromAuth(),
  ]);
  if (!user || !orgId) {
    return { items: [], nextCursor: null };
  }
  try {
    const result = await ragenApiRequest<{
      items: (Omit<NotificationDto, 'createdAt'> & { createdAt: string })[];
      nextCursor: string | null;
    }>({
      method: 'GET',
      path: '/v1/internal/notifications',
      userId: user.id,
      orgId,
      query: { ...params },
    });
    return {
      items: result.items.map((item) => ({
        ...item,
        createdAt: new Date(item.createdAt),
      })),
      nextCursor: result.nextCursor,
    };
  } catch (err) {
    logger.error({ err }, 'Failed to fetch notifications from apps/api');
    return { items: [], nextCursor: null };
  }
}

export async function markNotificationReadAction(publicId: string) {
  const [user, orgId] = await Promise.all([
    getCurrentUser(),
    getOrgIdFromAuthOrThrow(),
  ]);
  if (!user) {
    throw new Error('Not authenticated');
  }
  await ragenApiRequest({
    method: 'POST',
    path: `/v1/internal/notifications/${encodeURIComponent(publicId)}/read`,
    userId: user.id,
    orgId,
  });
}

export async function markAllNotificationsReadAction() {
  const [user, orgId] = await Promise.all([
    getCurrentUser(),
    getOrgIdFromAuthOrThrow(),
  ]);
  if (!user) {
    throw new Error('Not authenticated');
  }
  await ragenApiRequest({
    method: 'POST',
    path: '/v1/internal/notifications/read-all',
    userId: user.id,
    orgId,
  });
}

export async function updateFilePiiPolicy(
  fileId: string,
  piiPolicy: PiiPolicy,
): Promise<void> {
  const orgId = await getOrgIdFromAuthOrThrow();
  const VALID = new Set<string>(Object.values(PiiPolicy));
  if (!VALID.has(piiPolicy)) {
    throw new Error(`Invalid piiPolicy: ${piiPolicy}`);
  }
  await db.userFile.update({
    where: { id: fileId, organizationId: orgId },
    data: { piiPolicy },
  });
}

export async function reembedFile(
  fileId: string,
): Promise<{ workflowId: string }> {
  const orgId = await getOrgIdFromAuthOrThrow();
  await requireOrgAdmin(orgId);
  return reembedFileCommand(fileId, orgId);
}

export async function savePiiIngestionModeAction(
  mode: PiiIngestionMode,
): Promise<void> {
  const orgId = await getOrgIdFromAuthOrThrow();
  await requireOrgAdmin(orgId);
  await savePiiIngestionMode(orgId, mode);
}

export async function getPiiIngestionModeAction(): Promise<PiiIngestionMode> {
  const orgId = await getOrgIdFromAuthOrThrow();
  await requireOrgAdmin(orgId);
  return getPiiIngestionMode(orgId);
}
