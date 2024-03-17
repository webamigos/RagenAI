'use server';

import { StatusCodes } from 'http-status-codes';

import {
  CreateMessageDto,
  MessageDto,
  createMessageSchema,
} from '../../../../contracts/Message';
import { sendForModeration } from '../../../../lib/services/moderation';
import { getOrCreateThread } from '../../../../lib/services/thread';
import { createThreadMessage } from '../../../../lib/services/message';

type ResponseMessage =
  | {
      error: string;
      status: StatusCodes;
    }
  | {
      message: MessageDto;
      status: StatusCodes;
    };

export const sendMessage = async (
  threadId: string,
  data: CreateMessageDto
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
    });

    // IMPORTANT! run in background
    // TODO: it would be better to send on pub/sub
    // const reqUrl = request.headers.get('referer')!;
    // const url = new URL(reqUrl);

    // axios.post(`${url.origin}/api/assistant/${threadPublicId}`);

    // create user message and return it to display in frontend
    return { message: messageResponse, status: StatusCodes.CREATED };
  } catch (e) {
    console.log('processing error: ', e);
    return {
      error: 'Problem during processing',
      status: StatusCodes.BAD_REQUEST,
    };
  }
};
