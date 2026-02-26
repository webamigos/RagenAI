import { Role, Source } from '@/generated/prisma/client';
import db from '@ragenai/prisma-client';
import type { ApiContext } from '../types/ApiContext';
import type { ChatMessageDto } from '../dtos/chat.dto';
import { getAllSettings } from '@/features/organizations/services/organization-settings';
import { ApiKeyError } from '@/libs/chains/errors';
import { initializePublicRagChain } from '@/app/api/guest-threads/[...guestDetails]/services/initializePublicBasicRag';
import { createAndStoreMessageCommand as createAndStoreMessage } from '@/features/messages/services/commands/create-message-command';
import { createMessageInDbCommand as createMessageInDB } from '@/features/messages/services/commands/create-message-command';
import { findOrCreateThreadCommand as findOrCreateThread } from '@/features/threads/services/commands/find-or-create-thread-command';
import {
  prepareApiSseMessage,
  sendApiEvent,
} from '@/libs/sse/prepare-sse-message';
import { getApiChatMessagesQuery } from '../queries/api-threads.query';

async function prepareChainToRun(
  context: ApiContext,
  publicThreadId: string,
  payload: ChatMessageDto,
  controller?: ReadableStreamDefaultController,
) {
  const rawSettings = await getAllSettings(context.orgId);
  if (!rawSettings.apiKey) {
    throw new ApiKeyError();
  }
  let runId = '';

  if (controller) {
    sendApiEvent(controller, 'find_thread');
  }

  const { threadRecord } = await findOrCreateThread(
    publicThreadId,
    context.userId,
  );

  if (controller) {
    sendApiEvent(controller, 'thread_found', {
      id: threadRecord.public_id,
    });

    sendApiEvent(controller, 'save_user_message');
  }

  const threadMessage = await createAndStoreMessage({
    prompt: payload.content,
    threadId: threadRecord.id,
    visitorId: context.userId,
    messageType: payload.messageType,
    voiceDurationSeconds: payload.voiceDurationSeconds,
  });

  if (controller) {
    sendApiEvent(controller, 'user_message_saved', {
      id: threadMessage.public_id,
    });

    sendApiEvent(controller, 'init_lmm');
  }

  let projectPublicId: string | undefined;
  if (context.projectId) {
    const project = await db.project.findUnique({
      where: { id: context.projectId },
      select: { public_id: true },
    });
    projectPublicId = project?.public_id;
  }

  const chainOutput = await initializePublicRagChain({
    settings: { ...rawSettings, apiKey: rawSettings.apiKey },
    organizationId: context.orgId,
    projectPublicId,
  });

  if (controller) {
    sendApiEvent(controller, 'get_thread_messages');
  }

  const threadMessages = await getApiChatMessagesQuery(context, publicThreadId);

  if (controller) {
    sendApiEvent(controller, 'add_thread_messages_to_lmm');
  }

  const conv_history = threadMessages
    .map((msg: any) => `${msg.role.toLowerCase()}: ${msg.content}`)
    .join('\n');

  return {
    chainOutput,
    runId,
    threadRecord,
    threadMessage,
    conv_history,
  };
}

// TODO: moderation
export async function createApiChatMessagesCommand(
  context: ApiContext,
  publicThreadId: string,
  payload: ChatMessageDto,
) {
  const { chainOutput, threadRecord, threadMessage, runId, conv_history } =
    await prepareChainToRun(context, publicThreadId, payload);

  // for chat without streaming:
  const streamResult = await chainOutput.stream({
    question: payload.content,
    chat_history: conv_history,
  });

  const chatResponse = await streamResult.text;

  const dbMessage = await createMessageInDB({
    threadId: threadRecord.id,
    message: {
      id: threadMessage.public_id,
      content: chatResponse,
      source: Source.API,
    },
    role: Role.ASSISTANT,
    runId,
  });

  return {
    id: dbMessage.public_id,
    content: dbMessage.content,
    role: dbMessage.role,
    created_at: dbMessage.created_at,
  };
}

export async function streamApiChatMessagesCommand(
  context: ApiContext,
  publicThreadId: string,
  payload: ChatMessageDto,
  controller: ReadableStreamDefaultController,
) {
  const { chainOutput, threadRecord, threadMessage, conv_history } =
    await prepareChainToRun(context, publicThreadId, payload, controller);

  const encoder = new TextEncoder();
  controller.enqueue(encoder.encode(prepareApiSseMessage('start_lmm')));

  const streamResult = await chainOutput.stream({
    question: payload.content,
    chat_history: conv_history,
  });

  return { streamResult, threadRecord, threadMessage };
}
