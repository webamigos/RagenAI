'use server';

import { getOrgIdFromAuthOrThrow } from '@/app/lib/utils/auth-helpers';
import { getChatbotsQuery } from '@/features/chatbots/services/queries/get-chatbots-query';
import { getChatbotByIdQuery } from '@/features/chatbots/services/queries/get-chatbot-by-id-query';
import { createChatbotCommand } from '@/features/chatbots/services/commands/create-chatbot-command';
import { updateChatbotCommand } from '@/features/chatbots/services/commands/update-chatbot-command';
import { deleteChatbotCommand } from '@/features/chatbots/services/commands/delete-chatbot-command';
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
