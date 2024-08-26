'use server';

import { StatusCodes } from 'http-status-codes';
import { logger } from '../lib/utils/logger';

import {
  CreateMessageDto,
  MessageDto,
  createMessageSchema,
} from '../contracts/Message';
import { sendForModeration } from '../lib/services/moderation';
import { findOrCreateOpenAIThread } from '../lib/services/thread';
import { createAndStoreOpenAIThreadMessage } from '../lib/services/message';

type ResponseMessage = {
  status: StatusCodes;
  message?: MessageDto;
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
      threadPublicId
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
