'use server';

import { StatusCodes } from 'http-status-codes';

import {
  CreateMessageDto,
  MessageDto,
  createMessageSchema,
} from '../contracts/Message';
import { sendForModeration } from '../lib/services/moderation';
import { getOrCreateThread } from '../lib/services/thread';
import { createThreadMessage } from '../lib/services/message';

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

  const moderationResult = await sendForModeration(prompt);
  console.log({ moderationResult });

  if (moderationResult.isFlagged) {
    return { error: 'Bad message', status: StatusCodes.BAD_REQUEST };
  }

  // get or create thread
  try {
    const { thread, threadEntity } = await getOrCreateThread(threadPublicId);

    // create user message
    const messageResponse = await createThreadMessage({
      prompt,
      thread,
      threadEntity,
      visitorId,
    });
    console.log({ messageResponse });
    return { message: messageResponse, status: StatusCodes.CREATED };
  } catch (e) {
    console.log('processing error: ', e);
    return {
      error: 'Problem during processing',
      status: StatusCodes.BAD_REQUEST,
    };
  }
};
