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
import { createAndStoreOpenAIThreadMessage } from '../lib/services/message';
import { getUserThreads } from '../lib/services/visitor';
import {
  deleteDocumentFromDB,
  fetchUserDocumentsDetails,
} from '../lib/services/document';
import { deleteFile } from '../lib/services/api';

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
    logger.error('processing error: %o', e);
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
    const userThreads = await getUserThreads(visitorId, skip, take);

    return { threads: userThreads, status: StatusCodes.OK };
  } catch (err) {
    const errorMessage =
      err instanceof Error ? err.message : 'An error occurred';
    return { error: errorMessage, status: StatusCodes.BAD_REQUEST };
  }
};

//get user documents
export const getUserDocuments = async (orgId: string) => {
  try {
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
export const deleteDocument = async (
  organizationId: string,
  documentId: string
) => {
  try {
    const { count } = await deleteDocumentFromDB(organizationId, documentId);
    await deleteFile(organizationId, documentId);

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
    return {
      error: 'Failed to delete document',
      status: StatusCodes.INTERNAL_SERVER_ERROR,
    };
  }
};

//save data to clerk user profile
export const saveUserIdToClerk = async (
  clerkUserId: string,
  visitorId: string
) => {
  try {
    await clerkClient.users.updateUser(clerkUserId, {
      publicMetadata: {
        visitorId,
        userRole: 'USER',
      },
    });
    return { success: true };
  } catch (error) {
    return { success: false };
  }
};

//send answer rate to assistant
export const rateMessage = async (
  messageId: string,
  feedback: 'up' | 'down',
  runId: string
) => {
  try {
    await submitFeedbackDirectly(messageId, feedback, runId);
    return { success: true };
  } catch (error) {
    return { success: error };
  }
};
