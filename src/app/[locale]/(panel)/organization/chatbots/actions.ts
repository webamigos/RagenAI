'use server';

import { getOrgIdFromAuthOrThrow } from '@/app/lib/utils/auth-helpers';
import { requireOrgAdmin } from '@/lib/auth-guards';
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

// Chatbots are org-wide public-facing assets — create/update/delete
// and even read of conversations are admin-only. The layout guard
// blocks non-admin page rendering; these guards block direct RPC
// calls to the server actions.

export async function getChatbots() {
  const orgId = await getOrgIdFromAuthOrThrow();
  await requireOrgAdmin(orgId);
  return getChatbotsQuery(orgId);
}

export async function getChatbot(chatbotId: string) {
  const orgId = await getOrgIdFromAuthOrThrow();
  await requireOrgAdmin(orgId);
  return getChatbotByIdQuery(chatbotId, orgId);
}

export async function createChatbot(data: CreateChatbotDto) {
  const orgId = await getOrgIdFromAuthOrThrow();
  await requireOrgAdmin(orgId);
  return createChatbotCommand(orgId, data);
}

export async function updateChatbot(chatbotId: string, data: UpdateChatbotDto) {
  const orgId = await getOrgIdFromAuthOrThrow();
  await requireOrgAdmin(orgId);
  return updateChatbotCommand(chatbotId, orgId, data);
}

export async function deleteChatbot(chatbotId: string) {
  const orgId = await getOrgIdFromAuthOrThrow();
  await requireOrgAdmin(orgId);
  return deleteChatbotCommand(chatbotId, orgId);
}

export async function getChatbotFiles() {
  const orgId = await getOrgIdFromAuthOrThrow();
  await requireOrgAdmin(orgId);
  // Admins have full access to all org files by role definition, so
  // the `isOrgAdmin: true` bypass here is the correct semantic — not
  // a back door. It's safe precisely because the guard above limits
  // this call to actual admins.
  return getAllOrgFilesQuery(orgId, [], { isOrgAdmin: true });
}

export async function getChatbotThreads(
  chatbotId: string,
  skip = 0,
  take = 20,
) {
  const orgId = await getOrgIdFromAuthOrThrow();
  await requireOrgAdmin(orgId);
  return getChatbotThreadsQuery(chatbotId, orgId, skip, take);
}

export async function getChatbotThreadMessages(threadId: string) {
  const orgId = await getOrgIdFromAuthOrThrow();
  await requireOrgAdmin(orgId);
  return getChatbotThreadMessagesQuery(threadId, orgId);
}
