'use server';

import { getOrgIdFromAuthOrThrow } from '@/app/lib/utils/auth-helpers';
import { getChatbotsQuery } from '@/features/chatbots/services/queries/get-chatbots-query';
import { getChatbotByIdQuery } from '@/features/chatbots/services/queries/get-chatbot-by-id-query';
import { createChatbotCommand } from '@/features/chatbots/services/commands/create-chatbot-command';
import { updateChatbotCommand } from '@/features/chatbots/services/commands/update-chatbot-command';
import { deleteChatbotCommand } from '@/features/chatbots/services/commands/delete-chatbot-command';
import { getAllOrgFilesQuery } from '@/features/documents/services/queries/get-all-org-files-query';
import { getChatbotThreadsQuery } from '@/features/chatbots/services/queries/get-chatbot-threads-query';
import { getChatbotThreadMessagesQuery } from '@/features/chatbots/services/queries/get-chatbot-thread-messages-query';
import {
  type CreateChatbotDto,
  type UpdateChatbotDto,
} from '@/features/chatbots/contracts/chatbot.types';

export async function getChatbots() {
  const orgId = await getOrgIdFromAuthOrThrow();
  return getChatbotsQuery(orgId);
}

export async function getChatbot(chatbotId: string) {
  const orgId = await getOrgIdFromAuthOrThrow();
  return getChatbotByIdQuery(chatbotId, orgId);
}

export async function createChatbot(data: CreateChatbotDto) {
  const orgId = await getOrgIdFromAuthOrThrow();
  return createChatbotCommand(orgId, data);
}

export async function updateChatbot(chatbotId: string, data: UpdateChatbotDto) {
  const orgId = await getOrgIdFromAuthOrThrow();
  return updateChatbotCommand(chatbotId, orgId, data);
}

export async function deleteChatbot(chatbotId: string) {
  const orgId = await getOrgIdFromAuthOrThrow();
  return deleteChatbotCommand(chatbotId, orgId);
}

export async function getChatbotFiles() {
  const orgId = await getOrgIdFromAuthOrThrow();
  return getAllOrgFilesQuery(orgId, [], { isOrgAdmin: true });
}

export async function getChatbotThreads(
  chatbotId: string,
  skip = 0,
  take = 20,
) {
  const orgId = await getOrgIdFromAuthOrThrow();
  return getChatbotThreadsQuery(chatbotId, orgId, skip, take);
}

export async function getChatbotThreadMessages(threadId: string) {
  const orgId = await getOrgIdFromAuthOrThrow();
  return getChatbotThreadMessagesQuery(threadId, orgId);
}
