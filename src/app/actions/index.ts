'use server';

import { clerkClient } from '@clerk/nextjs/server';
import { StatusCodes } from 'http-status-codes';

import { deleteDocumentFromVectorStore } from '../api/upload/services/TableService';
import {
  CreateMessageDto,
  MessageDto,
  ThreadHistoryResponse,
  createMessageSchema,
} from '../contracts/Message';
import { deleteFromS3 } from '../lib/services/aws';
import { getOrgIdOrThrow } from '../lib/services/clerk';
import { deleteDocumentFromDb } from '../lib/services/document';
import { submitFeedbackDirectly } from '../lib/services/feedback';
import {
  deleteFileFromDb,
  fetchFileDetails,
  getFileDetails,
  getOrganizationFilesCount,
} from '../lib/services/file';
import {
  fetchProjectFiles,
  deleteProjectFile as deleteProjectFileFromService,
} from '../lib/services/project';
import {
  createAndStoreMessage,
  deleteMessageByPublicId,
} from '../lib/services/message';
import { sendForModeration } from '../lib/services/moderation';
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
import db from '@ragenai/prisma-client';

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
  const requestData = await createMessageSchema.safeParseAsync(data);

  if (!requestData.success) {
    return {
      error: 'Bad structure',
      status: StatusCodes.BAD_REQUEST,
    };
  }

  const threadPublicId = threadId;
  const prompt = requestData.data.prompt;

  //moderation is off right now
  const moderationResult = await sendForModeration(prompt);
  if (moderationResult.isFlagged) {
    return { error: 'Bad message', status: StatusCodes.BAD_REQUEST };
  }

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
export const getUserDocuments = async (orgId: string) => {
  try {
    setSentryServiceTag(serviceName);
    setSentryClerkOrganizationTag(orgId);
    const documentDetails = await fetchFileDetails(orgId);
    return { documentDetails };
  } catch (error) {
    return {
      error: 'Fetching documents details failed',
      status: StatusCodes.BAD_REQUEST,
    };
  }
};

// Get project files
export const getProjectFiles = async (projectId: number) => {
  try {
    setSentryServiceTag(serviceName);
    const files = await fetchProjectFiles(projectId);
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

    const fileRecord = await getFileDetails(fileId);
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
  fileId: string,
  projectId: number
) => {
  try {
    setSentryServiceTag(serviceName);
    setSentryContext('EXTRA_DATA', {
      fileId,
      projectId,
    });

    const fileRecord = await getFileDetails(fileId);
    if (!fileRecord) {
      return {
        error: 'File not found',
        status: StatusCodes.NOT_FOUND,
      };
    }

    const result = await deleteProjectFileFromService(fileId, projectId);

    // If the file has a stored S3 object, delete it too
    if (fileRecord) {
      const documentS3Path = `${fileId}.${getFileExtension(
        fileRecord.file_name
      )}`;

      try {
        await deleteFromS3(documentS3Path);
      } catch (s3Error) {
        // Log S3 error but continue since the DB entry was deleted
        logger.error('Failed to delete file from S3', { error: s3Error });
      }

      // Delete from UserDocument
      await deleteDocumentFromDb(fileRecord.organization_id, fileId);

      // Delete vectors
      await deleteDocumentFromVectorStore(fileId);
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

//remove user document
export const deleteDocumentAction = async (
  organizationId: string,
  documentId: string
) => {
  try {
    setSentryServiceTag(serviceName);
    setSentryClerkOrganizationTag(organizationId);
    setSentryContext('EXTRA_DATA', {
      documentId,
    });

    //  Removal document from `UserFile`
    // TODO: UserFile should be in relation to UserDocument
    const fileRecord = await getFileDetails(documentId);
    const { count } = await deleteFileFromDb(organizationId, documentId);

    if (fileRecord) {
      const documentS3Path = `${documentId}.${getFileExtension(
        fileRecord.file_name
      )}`;

      await deleteFromS3(documentS3Path);
    }

    // Removal from `UserDocument`
    await deleteDocumentFromDb(organizationId, documentId);

    // Removal vectors
    await deleteDocumentFromVectorStore(documentId);

    if (count === 0) {
      return {
        error:
          'Document not found or user does not have permission to delete it',
        status: StatusCodes.NOT_FOUND,
      };
    }

    // Check document count in organization
    const documentCount = await getOrganizationFilesCount(organizationId);

    // If no documents left, update public metadata
    if (documentCount === 0) {
      await saveOrganizationPublicMetadata(organizationId, {
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
    await clerkClient.organizations.updateOrganizationMetadata(organizationId, {
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
    const organization = await clerkClient.organizations.getOrganization({
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

export const trackThreadCreated = () => {
  usageTracker.incThreadsCount();
};

// Helper function for validating and deleting project file
const validateAndDeleteProjectFile = async (
  fileId: string,
  projectId: number
) => {
  const orgId = getOrgIdOrThrow();

  // First, check if the file belongs to the project
  const fileDetails = await getFileDetails(fileId);
  if (!fileDetails) {
    return { count: 0 };
  }

  // Use type assertion to handle project_id property
  const fileDetailsAny = fileDetails as any;
  if (fileDetailsAny.project_id !== projectId) {
    return { count: 0 };
  }

  // If it does, delete it using the imported service function
  return await deleteProjectFileFromService(fileId, projectId);
};
