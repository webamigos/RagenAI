'use server';

import { StatusCodes } from 'http-status-codes';
import { clerkClient } from '@clerk/nextjs/server';

import { submitFeedbackDirectly } from '../lib/services/feedback';
import { logger } from '../lib/utils/logger';
import {
  ThreadHistoryResponse,
  CreateMessageDto,
  MessageDto,
  createMessageSchema,
} from '../contracts/Message';
import { sendForModeration } from '../lib/services/moderation';
import { findOrCreateOpenAIThread } from '../lib/services/thread';
import {
  createAndStoreOpenAIThreadMessage,
  deleteMessageByPublicId,
} from '../lib/services/message';
import { getUserThreads } from '../lib/services/visitor';
import {
  deleteDocumentFromUserFile,
  deleteDocumentFromUserDocument,
  fetchUserDocumentsDetails,
} from '../lib/services/document';
import { deleteDocument } from '../api/upload/services/TableService';
import {
  setSentryClerkOrganizationTag,
  setSentryClerkUserTag,
  setSentryContext,
} from '../lib/services/sentry';
import { setSentryServiceTag } from '../lib/services/sentry';

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
    const { thread, threadEntity } = await findOrCreateOpenAIThread(
      threadPublicId,
      visitorId
    );

    // create user message
    const messageResponse = await createAndStoreOpenAIThreadMessage({
      prompt,
      thread,
      threadEntity,
      visitorId,
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
    const documentDetails = await fetchUserDocumentsDetails(orgId);
    return { documentDetails };
  } catch (error) {
    return {
      error: 'Fetching documents details failed',
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
    //  removal document from `UserFile`
    const { count } = await deleteDocumentFromUserFile(
      organizationId,
      documentId
    );
    // removal from `UserDocument`
    await deleteDocumentFromUserDocument(organizationId, documentId);
    // removal vector's
    await deleteDocument(documentId);

    if (count === 0) {
      return {
        error:
          'Document not found or user does not have permission to delete it',
        status: StatusCodes.NOT_FOUND,
      };
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
  onboardingComplete?: boolean
) => {
  try {
    const user = await clerkClient().users.getUser(clerkUserId);
    const currentMetadata = user.publicMetadata || {};

    setSentryServiceTag(serviceName);
    setSentryClerkUserTag(clerkUserId);
    await clerkClient().users.updateUser(clerkUserId, {
      publicMetadata: {
        ...currentMetadata,
        onboardingComplete: onboardingComplete,
      },
    });
    return { success: true };
  } catch (error) {
    logger.error({ err: error }, 'Error saving user id to clerk');
    return { success: false };
  }
};

// save data to clerk organization profile
export const SaveOrganizationPublicMetadata = async (
  organizationId: string,
  hasKnowledge: boolean
) => {
  clerkClient().organizations.updateOrganizationMetadata(organizationId, {
    publicMetadata: {
      hasKnowledge,
    },
  });
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
