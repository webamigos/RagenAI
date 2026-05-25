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
import { getAllOrgFilesQuery as fetchAllOrgFiles } from '@/features/documents/services/queries/get-all-org-files-query';
import { deleteFileCommand } from '@/features/documents/services/commands/delete-file-command';
import { reembedFileCommand } from '@/features/documents/services/commands/reembed-file-command';
import { getProjectFilesQuery as fetchProjectFiles } from '@/features/documents/services/queries/get-project-files-query';
import { regenerateAssistantMessageCommand } from '@/features/messages/services/commands/regenerate-assistant-message-command';
import { toggleThreadStarredCommand } from '@/features/threads/services/commands/toggle-thread-starred-command';
import { getSidebarThreadsQuery } from '@/features/threads/services/queries/get-sidebar-threads-query';
import { getAllThreadsQuery } from '@/features/threads/services/queries/get-all-threads-query';
import { renameThreadCommand } from '@/features/threads/services/commands/rename-thread-command';
import { deleteThreadCommand } from '@/features/threads/services/commands/delete-thread-command';
import { saveOrganizationPublicMetadataCommand } from '@/features/organizations/services/commands/save-organization-metadata-command';
import { logger } from '../lib/utils/logger';
import { getDefaultProjectIdQuery as fetchOrganizationDefaultProjectId } from '@/features/projects/services/queries/get-default-project-query';
import { getAccountSetupStatusQuery as getAccountSetupStatus } from '@/features/organizations/services/queries/get-account-setup-query';
import { getOrgIdFromAuthOrThrow as getOrgIdOrThrow } from '../lib/utils/auth-helpers';
import {
  getUserTeamIds,
  getActiveMember,
  requireOrgAdmin,
} from '@/lib/auth-guards';
import { isOrgAdmin } from '@/lib/auth-access-control';
import { getProjectStorageUsageQuery } from '@/features/organizations/services/queries/get-storage-usage-query';
import { switchOrganizationCommand } from '@/features/organizations/services/commands/switch-organization-command';
import { getUserOrganizationsQuery } from '@/features/organizations/services/queries/get-user-organizations-query';
import {
  getStorageLimits,
  getPiiIngestionMode,
  savePiiIngestionMode,
} from '@/features/organizations/services/organization-settings';
import type { PiiIngestionMode } from '@/features/organizations/contracts/organization.types';
import { defaultStorageLimits } from '@/features/organizations/constants/settings';
import { getProjectByIdOrThrowQuery as getProjectByIdOrThrow } from '@/features/projects/services/queries/get-project-query';
import { getNotificationsQuery } from '@/features/notifications/services/queries/get-notifications-query';
import { markAsReadCommand } from '@/features/notifications/services/commands/mark-as-read-command';
import { markAllAsReadCommand } from '@/features/notifications/services/commands/mark-all-as-read-command';
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

// Get all organization files (for knowledge base picker)
export const getAllOrgFiles = async () => {
  try {
    const orgId = await getOrgIdOrThrow();
    const user = await getCurrentUser();
    const userId = user?.id;
    const [teamIds, member] = await Promise.all([
      userId ? getUserTeamIds(orgId, userId) : [],
      userId ? getActiveMember(orgId) : null,
    ]);
    const files = await fetchAllOrgFiles(orgId, teamIds, {
      userId: userId ?? undefined,
      isOrgAdmin: member ? isOrgAdmin(member.role) : false,
    });
    return { files };
  } catch {
    return { files: [] };
  }
};

// Get project files
export const getProjectFiles = async (projectId: Project['id']) => {
  try {
    const files = await fetchProjectFiles(projectId);

    return { files };
  } catch (error) {
    return {
      error: 'Fetching project files failed',
      status: StatusCodes.BAD_REQUEST,
    };
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
  const { importFileToProjectCommand } =
    await import('@/features/documents/services/commands/import-file-to-project-command');

  const results = [];
  for (const fileId of fileIds) {
    try {
      const result = await importFileToProjectCommand(fileId, targetProjectId);
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
  const orgId = await getOrgIdFromAuthOrThrow();

  try {
    return await fetchOrganizationDefaultProjectId(orgId);
  } catch (error) {
    logger.error({ err: error }, 'Error fetching default project ID');
    throw error;
  }
};

export const toggleThreadStarred = async (
  threadId: string,
  isStarred: boolean,
) => {
  return toggleThreadStarredCommand(threadId, isStarred);
};

export const getSidebarThreads = async (
  visitorId: string,
  recentLimit?: number,
  recentSkip?: number,
) => {
  return getSidebarThreadsQuery(visitorId, recentLimit, recentSkip);
};

export const getAllThreads = async (
  visitorId: string,
  skip?: number,
  take?: number,
  query?: string,
) => {
  return getAllThreadsQuery(visitorId, skip, take, query);
};

export const renameThread = async (threadId: string, title: string) => {
  return renameThreadCommand(threadId, title);
};

export const deleteThread = async (threadId: string) => {
  return deleteThreadCommand(threadId);
};

export const getUserOrganizationsAction = async () => {
  return getUserOrganizationsQuery();
};

export const switchOrganizationAction = async (organizationId: string) => {
  return switchOrganizationCommand(organizationId);
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

export async function regenerateLastAssistantMessage(threadId: string) {
  const orgId = await getOrgIdFromAuthOrThrow();
  const user = await getCurrentUser();
  return regenerateAssistantMessageCommand(threadId, orgId, user?.id ?? '');
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
  return getNotificationsQuery({
    userId: user.id,
    organizationId: orgId,
    ...params,
  });
}

export async function markNotificationReadAction(publicId: string) {
  const [user, orgId] = await Promise.all([
    getCurrentUser(),
    getOrgIdFromAuthOrThrow(),
  ]);
  if (!user) {
    throw new Error('Not authenticated');
  }
  await markAsReadCommand({ publicId, userId: user.id, organizationId: orgId });
}

export async function markAllNotificationsReadAction() {
  const [user, orgId] = await Promise.all([
    getCurrentUser(),
    getOrgIdFromAuthOrThrow(),
  ]);
  if (!user) {
    throw new Error('Not authenticated');
  }
  await markAllAsReadCommand({ userId: user.id, organizationId: orgId });
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
