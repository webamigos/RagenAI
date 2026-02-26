'use server';

import { StatusCodes } from 'http-status-codes';
import {
  getOrgIdFromAuthOrThrow,
  getCurrentUser,
} from '../lib/utils/auth-helpers';

import { deleteFileFromVectorStore } from '../api/upload/services/TableService';
import {
  type CreateMessageDto,
  type MessageDto,
} from '@/features/messages/contracts/message.types';
import { type ThreadHistoryResponse } from '@/features/threads/contracts/thread.types';
import { deleteFromS3 } from '../lib/services/aws';
import { getDocumentByPublicIdQuery as getDocumentByPublicId } from '@/features/documents/services/queries/get-document-query';
import { deleteDocumentFromDbCommand as deleteDocumentFromDb } from '@/features/documents/services/commands/update-document-command';
import { getFileDetailsByPublicIdQuery as getFileDetailsByPublicId } from '@/features/documents/services/queries/get-file-details-query';
import { getOrganizationFilesCountQuery as getOrganizationFilesCount } from '@/features/documents/services/queries/get-file-details-query';
import { getUserFilesQuery as fetchFilesDetails } from '@/features/documents/services/queries/get-user-files-query';
import { getAllOrgFilesQuery as fetchAllOrgFiles } from '@/features/documents/services/queries/get-all-org-files-query';
import { deleteFileFromDbCommand as deleteFileFromDb } from '@/features/documents/services/commands/delete-file-from-db-command';
import { getProjectFilesQuery as fetchProjectFiles } from '@/features/documents/services/queries/get-project-files-query';
import { deleteProjectFileFromDbCommand as deleteProjectFileFromService } from '@/features/documents/services/commands/delete-project-file-from-db-command';
import { getDefaultProjectPublicIdQuery as fetchOrganizationDefaultProjectPublicId } from '@/features/projects/services/queries/get-default-project-query';
import { sendMessageCommand } from '@/features/messages/services/commands/send-message-command';
import { deleteMessageCommand } from '@/features/messages/services/commands/delete-message-command';
import { rateMessageCommand } from '@/features/messages/services/commands/rate-message-command';
import { getUserThreadsQuery } from '@/features/threads/services/queries/get-user-threads-query';
import { searchThreadsQuery } from '@/features/threads/services/queries/search-threads-query';
import { trackThreadCreatedCommand } from '@/features/threads/services/commands/track-thread-created-command';
import { toggleThreadStarredCommand } from '@/features/threads/services/commands/toggle-thread-starred-command';
import { getSidebarThreadsQuery } from '@/features/threads/services/queries/get-sidebar-threads-query';
import { getAllThreadsQuery } from '@/features/threads/services/queries/get-all-threads-query';
import { renameThreadCommand } from '@/features/threads/services/commands/rename-thread-command';
import { deleteThreadCommand } from '@/features/threads/services/commands/delete-thread-command';
import {
  saveOrganizationPublicMetadataCommand,
  saveOrganizationInitialMetadataCommand,
} from '@/features/organizations/services/commands/save-organization-metadata-command';
import { getOrganizationMetadataQuery } from '@/features/organizations/services/queries/get-organization-metadata-query';
import { getFileExtension } from '../lib/utils/getFileExtension';
import { logger } from '../lib/utils/logger';
import { getDefaultProjectIdQuery as fetchOrganizationDefaultProjectId } from '@/features/projects/services/queries/get-default-project-query';
import { getAccountSetupStatusQuery as getAccountSetupStatus } from '@/features/organizations/services/queries/get-account-setup-query';
import { getOrgIdFromAuthOrThrow as getOrgIdOrThrow } from '../lib/utils/auth-helpers';
import { saveUserMetadataCommand } from '@/features/users/services/commands/save-user-metadata-command';
import { getProjectStorageUsageQuery } from '@/features/organizations/services/queries/get-storage-usage-query';
import { getStorageLimits } from '@/features/organizations/services/organization-settings';
import { defaultStorageLimits } from '@/features/organizations/constants/settings';
import { getProjectByPublicIdOrThrowQuery as getProjectByPublicIdOrThrow } from '@/features/projects/services/queries/get-project-query';
import type { Project, UserFile } from '@/generated/prisma/client';

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
export const getUserFiles = async () => {
  try {
    const orgId = await getOrgIdOrThrow();
    const files = await fetchFilesDetails(orgId);
    return { files };
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
    const files = await fetchAllOrgFiles(orgId);
    return { files };
  } catch {
    return { files: [] };
  }
};

// Get project files
export const getProjectFiles = async (
  projectPublicId: Project['public_id'],
) => {
  try {
    const files = await fetchProjectFiles(projectPublicId);

    return { files };
  } catch (error) {
    return {
      error: 'Fetching project files failed',
      status: StatusCodes.BAD_REQUEST,
    };
  }
};

// Get project storage info (usage + limits)
export const getProjectStorageInfo = async (
  projectPublicId: Project['public_id'],
) => {
  try {
    const orgId = await getOrgIdOrThrow();
    const project = await getProjectByPublicIdOrThrow(projectPublicId);
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
  filePublicIds: string[],
  targetProjectPublicId: string,
) => {
  const { importFileToProjectCommand } =
    await import('@/features/documents/services/commands/import-file-to-project-command');

  const results = [];
  for (const fileId of filePublicIds) {
    try {
      const result = await importFileToProjectCommand(
        fileId,
        targetProjectPublicId,
      );
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
    const fileRecord = await getFileDetailsByPublicId(fileId);
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
  filePublicId: UserFile['public_id'],
  projectPublicId: Project['public_id'],
) => {
  try {
    const fileRecord = await getFileDetailsByPublicId(filePublicId);
    if (!fileRecord) {
      return {
        error: 'File not found',
        status: StatusCodes.NOT_FOUND,
      };
    }

    const fileId = fileRecord.id;

    const result = await deleteProjectFileFromService(
      filePublicId,
      projectPublicId,
    );

    // If the file has a stored S3 object, delete it too
    if (fileRecord) {
      const documentS3Path = `${fileRecord.public_id}.${getFileExtension(
        fileRecord.file_name,
      )}`;

      try {
        await deleteFromS3(documentS3Path);
      } catch (s3Error) {
        // Log S3 error but continue since the DB entry was deleted
        logger.error('Failed to delete file from S3', { error: s3Error });
      }

      // Delete from UserDocument
      const documentId = fileRecord.document_id;
      if (documentId) {
        const userDocument = await getDocumentByPublicId(documentId);
        if (userDocument) {
          await deleteDocumentFromDb(userDocument.id);
        }
      }

      // Delete vectors
      await deleteFileFromVectorStore(fileId);
    }

    return {
      success: true,
      count: result?.count || 0,
    };
  } catch (error) {
    return {
      error: `Failed to delete project file: ${error}`,
      status: StatusCodes.BAD_REQUEST,
    };
  }
};

//remove user file
export const deleteFileAction = async (filePublicId: UserFile['public_id']) => {
  try {
    const orgId = await getOrgIdOrThrow();
    //  Removal document from `UserFile`
    // TODO: UserFile should be in relation to UserDocument
    const fileRecord = await getFileDetailsByPublicId(filePublicId);
    const { count } = await deleteFileFromDb(filePublicId);

    if (fileRecord) {
      const documentS3Path = `${filePublicId}.${getFileExtension(
        fileRecord.file_name,
      )}`;

      await deleteFromS3(documentS3Path);

      // Removal from `UserDocument`
      const documentId = fileRecord?.document_id;
      if (documentId) {
        await deleteDocumentFromDb(documentId);
      }

      // Removal vectors
      await deleteFileFromVectorStore(fileRecord.id);

      if (count === 0) {
        return {
          error:
            'Document not found or user does not have permission to delete it',
          status: StatusCodes.NOT_FOUND,
        };
      }

      // Check document count in organization
      const documentCount = await getOrganizationFilesCount(orgId);

      // If no documents left, update public metadata
      if (documentCount === 0) {
        await saveOrganizationPublicMetadata(orgId, {
          hasKnowledge: false,
        });
      }

      return {
        message: 'Document deleted successfully',
        status: StatusCodes.OK,
      };
    }
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

/** @deprecated Use saveOrganizationInitialMetadataCommand from @/features/organizations instead */
export const saveOrganizationInitialMetadata =
  saveOrganizationInitialMetadataCommand;

/** @deprecated Use getOrganizationMetadataQuery from @/features/organizations instead */
export const getOrganizationMetadata = getOrganizationMetadataQuery;

/** @deprecated Use rateMessageCommand from @/features/messages instead */
export const rateMessage = async (
  messageId: string,
  feedback: 'up' | 'down',
) => {
  return rateMessageCommand(messageId, feedback);
};

/** @deprecated Use deleteMessageCommand from @/features/messages instead */
export async function deleteUserMessage(messagePublicId: string) {
  return deleteMessageCommand(messagePublicId);
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
  const orgId = await getOrgIdFromAuthOrThrow();

  try {
    return await fetchOrganizationDefaultProjectId(orgId);
  } catch (error) {
    logger.error({ err: error }, 'Error fetching default project ID');
    throw error;
  }
};

export const getDefaultProjectPublicId = async () => {
  const orgId = await getOrgIdFromAuthOrThrow();

  logger.info(
    { orgId },
    'Organization ID retrieved in getDefaultProjectPublicId',
  );

  try {
    return await fetchOrganizationDefaultProjectPublicId(orgId);
  } catch (error) {
    logger.error({ err: error }, 'Error fetching default project ID');
    throw error;
  }
};

export const toggleThreadStarred = async (
  threadPublicId: string,
  isStarred: boolean,
) => {
  return toggleThreadStarredCommand(threadPublicId, isStarred);
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

export const renameThread = async (threadPublicId: string, title: string) => {
  return renameThreadCommand(threadPublicId, title);
};

export const deleteThread = async (threadPublicId: string) => {
  return deleteThreadCommand(threadPublicId);
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
