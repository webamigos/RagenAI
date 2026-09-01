'use server';

import { revalidatePath } from 'next/cache';
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
  createChatbotSchema,
  updateChatbotSchema,
} from '@/features/chatbots/contracts/chatbot.types';

// Chatbots are org-wide public-facing assets — create/update/delete
// and even read of conversations are admin-only. The layout guard
// blocks non-admin page rendering; these guards block direct RPC
// calls to the server actions. Payload shape is re-validated here so
// a crafted client bypassing the TS DTO type still gets schema errors
// at the action boundary before any command runs.

const CHATBOTS_ROUTE = '/organization/chatbots';

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
  const parsed = createChatbotSchema.parse(data);
  const chatbot = await createChatbotCommand(orgId, parsed);
  revalidatePath(CHATBOTS_ROUTE);
  return chatbot;
}

export async function updateChatbot(chatbotId: string, data: UpdateChatbotDto) {
  const orgId = await getOrgIdFromAuthOrThrow();
  await requireOrgAdmin(orgId);
  const parsed = updateChatbotSchema.parse(data);
  const chatbot = await updateChatbotCommand(chatbotId, orgId, parsed);
  revalidatePath(CHATBOTS_ROUTE);
  revalidatePath(`${CHATBOTS_ROUTE}/${chatbotId}`);
  return chatbot;
}

export async function deleteChatbot(chatbotId: string) {
  const orgId = await getOrgIdFromAuthOrThrow();
  await requireOrgAdmin(orgId);
  const result = await deleteChatbotCommand(chatbotId, orgId);
  revalidatePath(CHATBOTS_ROUTE);
  return result;
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
