'use server';

import { StatusCodes } from 'http-status-codes';
import { clerkClient } from '@clerk/nextjs/server';

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

export const getUserMessages = async (
  visitorId: string,
  skip?: number,
  take?: number
): Promise<ResponseHistory> => {
  try {
    const userThreads = await getUserThreads(visitorId, skip, take);

    return { threads: userThreads, status: StatusCodes.CREATED };
  } catch (err) {
    return {
      error: 'Fetching threads failed',
      status: StatusCodes.BAD_REQUEST,
    };
  }
};

export const saveUserIdToClerk = async (
  clerkUserId: string,
  userId: string
) => {
  try {
    await clerkClient.users.updateUser(clerkUserId, {
      publicMetadata: {
        userId,
      },
    });
    return { success: true };
  } catch (error) {
    return { success: false };
  }
};
