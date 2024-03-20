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
import { askAssistant } from '../lib/services/assistant';

type ResponseMessage =
  | {
      error: string;
      status: StatusCodes;
    }
  | {
      message: MessageDto | string;
      status: StatusCodes;
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

    return { message: messageResponse, status: StatusCodes.CREATED };
  } catch (e) {
    console.log('processing error: ', e);
    return {
      error: 'Problem during processing',
      status: StatusCodes.BAD_REQUEST,
    };
  }
};

// @duplicated
export const runAssistant = async (
  threadId: string
): Promise<ResponseMessage> => {
  const publicThreadId = threadId;

  try {
    void askAssistant(publicThreadId);

    // create user message and return it to display in frontend
    return { message: 'Processing started', status: StatusCodes.OK };
  } catch (e) {
    console.log('Assistant processing error: ', e);
    return {
      error: 'Problem during processing',
      status: StatusCodes.BAD_REQUEST,
    };
  }
};
