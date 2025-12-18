'use server';

import { auth, clerkClient } from '@clerk/nextjs/server';
import { StatusCodes } from 'http-status-codes';
import { getOrgIdFromAuthOrThrow } from '../lib/utils/auth-helpers';

import { deleteFileFromVectorStore } from '../api/upload/services/TableService';
import {
  CreateMessageDto,
  MessageDto,
  ThreadHistoryResponse,
} from '../contracts/Message';
import { createMessageSchema } from '../contracts/Message';
import { deleteFromS3 } from '../lib/services/aws';
import {
  deleteDocumentFromDb,
  getDocumentByPublicId,
} from '../lib/services/document';
import { submitFeedbackDirectly } from '../lib/services/feedback';
import {
  deleteFileFromDb,
  fetchFilesDetails,
  getFileDetailsByPublicId,
  getOrganizationFilesCount,
} from '../lib/services/file';
import {
  fetchProjectFiles,
  deleteProjectFile as deleteProjectFileFromService,
  fetchOrganizationDefaultProjectPublicId,
} from '../lib/services/project';
import {
  createAndStoreMessage,
  deleteMessageByPublicId,
} from '../lib/services/message';
import {
  setSentryClerkOrganizationTag,
  setSentryClerkUserTag,
  setSentryContext,
  setSentryServiceTag,
} from '../lib/services/sentry';
import { findOrCreateThread } from '../lib/services/thread';
import { usageTracker } from '../lib/services/usage';
import { getUserThreads } from '../lib/services/visitor';
import {
  ClerkOrganizationMetadata,
  ClerkOrganizationPublicMetadata,
} from '../lib/types/organizations';
import { getFileExtension } from '../lib/utils/getFileExtension';
import { logger } from '../lib/utils/logger';
import { fetchOrganizationDefaultProjectId } from '../lib/services/project';
import { getAccountSetupStatus } from '../lib/services/account-setup';
import { getOrgIdOrThrow } from '../lib/services/clerk';
import { Project, UserFile } from '@prisma/client';

const serviceName = 'actions';

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

export const sendMessage = async (
  threadId: string,
  data: CreateMessageDto,
  visitorId: string
): Promise<ResponseMessage> => {
  const requestData = await createMessageSchema().safeParseAsync(data);

  if (!requestData.success) {
    return {
      error: 'Bad structure',
      status: StatusCodes.BAD_REQUEST,
    };
  }

  const threadPublicId = threadId;
  const prompt = requestData.data.prompt;

  // get or create thread
  try {
    setSentryServiceTag(serviceName);
    setSentryContext('EXTRA_DATA', {
      threadPublicId,
      visitorId,
    });
    const { threadRecord } = await findOrCreateThread(
      threadPublicId,
      visitorId
    );

    // create user message
    const messageResponse = await createAndStoreMessage({
      prompt,
      threadId: threadRecord.id,
      visitorId,
      messageType: requestData.data.messageType,
      voiceDurationSeconds: requestData.data.voiceDurationSeconds,
    });

    return { message: messageResponse, status: StatusCodes.CREATED };
  } catch (e) {
    logger.error({ err: e }, 'processing error');
    return {
      error: 'Problem during processing',
      status: StatusCodes.BAD_REQUEST,
    };
  }
};
//get user threads
export const getUserMessages = async (
  visitorId: string,
  skip?: number,
  take?: number
): Promise<ResponseHistory> => {
  try {
    setSentryServiceTag(serviceName);
    setSentryContext('EXTRA_DATA', {
      visitorId,
    });
    const userThreads = await getUserThreads(visitorId, skip, take);

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
    setSentryServiceTag(serviceName);
    setSentryClerkOrganizationTag(orgId);
    const files = await fetchFilesDetails(orgId);
    return { files };
  } catch (error) {
    return {
      error: 'Fetching documents details failed',
      status: StatusCodes.BAD_REQUEST,
    };
  }
};

// Get project files
export const getProjectFiles = async (
  projectPublicId: Project['public_id']
) => {
  try {
    setSentryServiceTag(serviceName);
    const files = await fetchProjectFiles(projectPublicId);

    return { files };
  } catch (error) {
    return {
      error: 'Fetching project files failed',
      status: StatusCodes.BAD_REQUEST,
    };
  }
};

// Get file details for download
export const getFileDetailsForDownload = async (fileId: string) => {
  try {
    setSentryServiceTag(serviceName);
    setSentryContext('EXTRA_DATA', {
      fileId,
    });

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
  projectPublicId: Project['public_id']
) => {
  try {
    setSentryServiceTag(serviceName);
    setSentryContext('EXTRA_DATA', {
      filePublicId,
      projectPublicId,
    });

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
      projectPublicId
    );

    // If the file has a stored S3 object, delete it too
    if (fileRecord) {
      const documentS3Path = `${fileRecord.public_id}.${getFileExtension(
        fileRecord.file_name
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
    setSentryServiceTag(serviceName);
    setSentryClerkOrganizationTag(orgId);
    setSentryContext('EXTRA_DATA', {
      filePublicId,
    });

    //  Removal document from `UserFile`
    // TODO: UserFile should be in relation to UserDocument
    const fileRecord = await getFileDetailsByPublicId(filePublicId);
    const { count } = await deleteFileFromDb(filePublicId);

    if (fileRecord) {
      const documentS3Path = `${filePublicId}.${getFileExtension(
        fileRecord.file_name
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

//save data to clerk user profile
export const saveUserMetadata = async (
  clerkUserId: string,
  metadata: Record<string, unknown>
): Promise<{ success: boolean; error?: string }> => {
  if (!clerkUserId || typeof clerkUserId !== 'string') {
    return { success: false, error: 'Invalid clerkUserId' };
  }

  try {
    const user = await clerkClient().users.getUser(clerkUserId);
    const currentMetadata = user.publicMetadata || {};

    await clerkClient().users.updateUser(clerkUserId, {
      publicMetadata: {
        ...currentMetadata,
        ...metadata,
      },
    });

    return { success: true };
  } catch (error) {
    logger.error(`${{ err: error }} Error saving user metadata:`);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
};

// save data to clerk organization profile
// TODO: should it be public?
export const saveOrganizationPublicMetadata = async (
  organizationId: string,
  { hasKnowledge }: ClerkOrganizationPublicMetadata
) => {
  setSentryServiceTag('saveOrganizationPublicMetadata');
  setSentryClerkUserTag(organizationId);

  try {
    await clerkClient().organizations.updateOrganizationMetadata(
      organizationId,
      {
        publicMetadata: {
          hasKnowledge,
        },
      }
    );
  } catch (error) {
    logger.error(
      { error },
      `Error: cannot update public metadata for organization ${organizationId}:`
    );
  }
};

export const saveOrganizationInitialMetadata = async (
  organizationId: string,
  { publicMetadata, privateMetadata }: ClerkOrganizationMetadata
) => {
  setSentryServiceTag('saveOrganizationInitialMetadata');
  setSentryClerkUserTag(organizationId);

  try {
    await (
      await clerkClient()
    ).organizations.updateOrganizationMetadata(organizationId, {
      publicMetadata,
      privateMetadata,
    });
  } catch (error) {
    logger.error(
      { error },
      `Error: cannot update private metadata for organization ${organizationId}:`
    );
  }
};

export const getOrganizationMetadata = async (
  organizationId: string
): Promise<ClerkOrganizationMetadata> => {
  setSentryServiceTag('getOrganizationMetadata');
  setSentryClerkUserTag(organizationId);

  try {
    const organization = await (
      await clerkClient()
    ).organizations.getOrganization({
      organizationId,
    });
    return {
      publicMetadata: organization.publicMetadata,
      privateMetadata: organization.privateMetadata,
    } as ClerkOrganizationMetadata;
  } catch (error) {
    logger.error(
      { err: error },
      `Error: cannot get private metadata for organization ${organizationId}:`
    );
    return {
      publicMetadata: undefined,
      privateMetadata: undefined,
    };
  }
};

//send answer rate to assistant
export const rateMessage = async (
  messageId: string,
  feedback: 'up' | 'down',
  runId: string
) => {
  try {
    setSentryServiceTag(serviceName);
    setSentryContext('EXTRA_DATA', {
      messageId,
      feedback,
      runId,
    });
    await submitFeedbackDirectly(messageId, feedback, runId);
    return { success: true };
  } catch (error) {
    logger.error({ err: error }, 'Error sending answer rate');
    return { success: false };
  }
};

export async function deleteUserMessage(messagePublicId: string) {
  try {
    setSentryServiceTag(serviceName);
    setSentryContext('EXTRA_DATA', {
      messagePublicId,
    });
    await deleteMessageByPublicId(messagePublicId);
    return { success: true };
  } catch (error) {
    logger.error({ err: error }, 'Error deleting user message');
    return { success: false };
  }
}

//autocomplete suggestions
export async function fetchThreadSuggestions(
  visitorId: string,
  query: string
): Promise<{ id: string; title: string }[]> {
  if (!visitorId || !query.trim() || query.trim().length < 3) {
    return [];
  }

  const threads = await getUserThreads(visitorId, 0, 5, query);

  return threads.map((thread) => ({
    id: thread.public_id,
    title: thread.messages[0]?.content.slice(0, 50) || 'No title',
  }));
}

export const trackThreadCreated = async () => {
  usageTracker.incThreadsCount();
};

export const getDefaultProjectId = async () => {
  const { orgId } = await auth();

  if (!orgId) {
    throw new Error('Organization ID is required');
  }

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
    'Organization ID retrieved in getDefaultProjectPublicId'
  );

  try {
    return await fetchOrganizationDefaultProjectPublicId(orgId);
  } catch (error) {
    logger.error({ err: error }, 'Error fetching default project ID');
    throw error;
  }
};

export const getAccountSetupStatusAction = async () => {
  try {
    // Try to get userId from auth context
    // This works in some contexts where currentUser() doesn't
    let userId: string | undefined;
    try {
      const authResult = await auth();
      userId = authResult.userId || undefined;
    } catch (authError) {
      // If auth() fails, getAccountSetupStatus will try currentUser() as fallback
      logger.warn(
        'Could not get userId from auth() in Server Action, will use currentUser()'
      );
    }

    return await getAccountSetupStatus(userId);
  } catch (error) {
    logger.error({ err: error }, 'Error fetching account setup status');
    throw error;
  }
};
