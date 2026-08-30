'use server';

import { StatusCodes } from 'http-status-codes';
import {
  getOrgIdFromAuthOrThrow,
  getOrgIdFromAuth,
  getCurrentUser,
} from '../lib/utils/auth-helpers';

import {
  type CreateMessageDto,
  type MessageDto,
} from '@/features/messages/contracts/message.types';
import { type ThreadHistoryResponse } from '@/features/threads/contracts/thread.types';
import { getFileDetailsByIdQuery as getFileDetailsById } from '@/features/documents/services/queries/get-file-details-query';
import { getOrganizationFilesCountQuery as getOrganizationFilesCount } from '@/features/documents/services/queries/get-file-details-query';
import { getUserFilesQuery as fetchFilesDetails } from '@/features/documents/services/queries/get-user-files-query';
import { deleteFileCommand } from '@/features/documents/services/commands/delete-file-command';
import { reembedFileCommand } from '@/features/documents/services/commands/reembed-file-command';
import { sendMessageCommand } from '@/features/messages/services/commands/send-message-command';
import type { RegenerateData } from '@/features/messages/services/commands/regenerate-assistant-message-command';
import type { OperationResult } from '@/types/common';
import { getUserThreadsQuery } from '@/features/threads/services/queries/get-user-threads-query';
import { searchThreadsQuery } from '@/features/threads/services/queries/search-threads-query';
import { trackThreadCreatedCommand } from '@/features/threads/services/commands/track-thread-created-command';
import { toggleThreadStarredCommand } from '@/features/threads/services/commands/toggle-thread-starred-command';
import { getSidebarThreadsQuery } from '@/features/threads/services/queries/get-sidebar-threads-query';
import { getAllThreadsQuery } from '@/features/threads/services/queries/get-all-threads-query';
import { renameThreadCommand } from '@/features/threads/services/commands/rename-thread-command';
import { deleteThreadCommand } from '@/features/threads/services/commands/delete-thread-command';
import { saveOrganizationPublicMetadataCommand } from '@/features/organizations/services/commands/save-organization-metadata-command';
import { getOrganizationMetadataQuery } from '@/features/organizations/services/queries/get-organization-metadata-query';
import { logger } from '../lib/utils/logger';
import { getAccountSetupStatusQuery as getAccountSetupStatus } from '@/features/organizations/services/queries/get-account-setup-query';
import { getOrgIdFromAuthOrThrow as getOrgIdOrThrow } from '../lib/utils/auth-helpers';
import {
  getUserTeamIds,
  getActiveMember,
  requireOrgAdmin,
} from '@/lib/auth-guards';
import { isOrgAdmin } from '@/lib/auth-access-control';
import { saveUserMetadataCommand } from '@/features/users/services/commands/save-user-metadata-command';
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
import { ragenApiRequest } from '@/libs/ragen-api-client/client';
import type { NotificationDto } from '@/features/notifications/contracts/notification.types';
import type { NotificationType } from '@/generated/prisma/client';
import type { Project, UserFile } from '@/generated/prisma/client';
import { PiiPolicy } from '@/generated/prisma/client';
import db from '@ragenai/prisma-client';

type ResponseMessage = {
  status: StatusCodes;
  message?: MessageDto;
  error?: string;
};

type ResponseHistory = {
  threads?: ThreadHistoryResponse[];
  status: StatusCodes;
  error?: string;
};

/** @deprecated Use sendMessageCommand from @/features/messages instead */
export const sendMessage = async (
  threadId: string,
  data: CreateMessageDto,
  visitorId: string,
): Promise<ResponseMessage> => {
  return sendMessageCommand(threadId, data, visitorId);
};
/** @deprecated Use getUserThreadsQuery from @/features/threads instead */
export const getUserMessages = async (
  visitorId: string,
  skip?: number,
  take?: number,
): Promise<ResponseHistory> => {
  try {
    const userThreads = await getUserThreadsQuery(visitorId, skip, take);

    return { threads: userThreads, status: StatusCodes.OK };
  } catch (err) {
    logger.error({ err }, 'Error getting user threads');
    const errorMessage =
      err instanceof Error ? err.message : 'An error occurred';
    return { error: errorMessage, status: StatusCodes.BAD_REQUEST };
  }
};

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

type ProjectFileItem = {
  id: string;
  createdAt: Date | null;
  fileName: string;
  fileSize: number;
  fileType: import('@/generated/prisma/client').FileType;
  updatedAt: Date | null;
  metadata: unknown;
  organizationId: string;
  parsingStatus: string;
  embeddingStatus: string;
};

// Get project files
export const getProjectFiles = async (projectId: Project['id']) => {
  try {
    const orgId = await getOrgIdOrThrow();
    const user = await getCurrentUser();
    if (!user) {
      return {
        error: 'Not authenticated',
        status: StatusCodes.UNAUTHORIZED,
      };
    }
    const files = await ragenApiRequest<ProjectFileItem[]>({
      method: 'GET',
      path: `/v1/internal/projects/${encodeURIComponent(projectId)}/files`,
      userId: user.id,
      orgId,
    });

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
      await saveOrganizationPublicMetadata(orgId, {
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

  return {
    status: StatusCodes.NOT_FOUND,
  };
};

/** @deprecated Use saveUserMetadataCommand from @/features/users instead */
export const saveUserMetadata = saveUserMetadataCommand;

/** @deprecated Use saveOrganizationPublicMetadataCommand from @/features/organizations instead */
export const saveOrganizationPublicMetadata =
  saveOrganizationPublicMetadataCommand;

/** @deprecated Use getOrganizationMetadataQuery from @/features/organizations instead */
export const getOrganizationMetadata = getOrganizationMetadataQuery;

export const rateMessage = async (
  messageId: string,
  feedback: 'up' | 'down',
): Promise<OperationResult> => {
  const [user, orgId] = await Promise.all([
    getCurrentUser(),
    getOrgIdFromAuthOrThrow(),
  ]);
  if (!user) {
    return { success: false, error: 'Not authenticated' };
  }
  try {
    return await ragenApiRequest<OperationResult>({
      method: 'POST',
      path: `/v1/internal/messages/${encodeURIComponent(messageId)}/rate`,
      userId: user.id,
      orgId,
      body: { feedback },
    });
  } catch (err) {
    logger.error({ err }, 'Failed to rate message via apps/api');
    return { success: false, error: 'Failed to rate message' };
  }
};

export async function deleteUserMessage(
  messagePublicId: string,
): Promise<OperationResult> {
  const [user, orgId] = await Promise.all([
    getCurrentUser(),
    getOrgIdFromAuthOrThrow(),
  ]);
  if (!user) {
    return { success: false, error: 'Not authenticated' };
  }
  try {
    return await ragenApiRequest<OperationResult>({
      method: 'DELETE',
      path: `/v1/internal/messages/${encodeURIComponent(messagePublicId)}`,
      userId: user.id,
      orgId,
    });
  } catch (err) {
    logger.error({ err }, 'Failed to delete message via apps/api');
    return { success: false, error: 'Failed to delete message' };
  }
}

/** @deprecated Use searchThreadsQuery from @/features/threads instead */
export async function fetchThreadSuggestions(
  visitorId: string,
  query: string,
): Promise<{ id: string; title: string }[]> {
  return searchThreadsQuery(visitorId, query);
}

/** @deprecated Use trackThreadCreatedCommand from @/features/threads instead */
export const trackThreadCreated = async () => {
  return trackThreadCreatedCommand();
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

/** @deprecated Use getDefaultProjectId instead - publicId no longer exists */
export const getDefaultProjectPublicId = async () => {
  return getDefaultProjectId();
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
