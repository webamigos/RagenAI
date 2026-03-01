'use server';

import { StatusCodes } from 'http-status-codes';
import { logger } from '@/app/lib/utils/logger';
import { findOrCreateThreadCommand as findOrCreateThread } from '@/features/threads/services/commands/find-or-create-thread-command';
import {
  createMessageSchema,
  type CreateMessageDto,
  type MessageDto,
} from '../../contracts/message.types';
import { createAndStoreMessageCommand } from './create-message-command';

type SendMessageResponse = {
  status: StatusCodes;
  message?: MessageDto;
  error?: string;
};

export const sendMessageCommand = async (
  threadId: string,
  data: CreateMessageDto,
  visitorId: string
): Promise<SendMessageResponse> => {
  const requestData = await createMessageSchema().safeParseAsync(data);

  if (!requestData.success) {
    return {
      error: 'Bad structure',
      status: StatusCodes.BAD_REQUEST,
    };
  }

  const threadPublicId = threadId;
  const prompt = requestData.data.prompt;

  try {
    const { threadRecord } = await findOrCreateThread(
      threadPublicId,
      visitorId
    );

    const messageResponse = await createAndStoreMessageCommand({
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
