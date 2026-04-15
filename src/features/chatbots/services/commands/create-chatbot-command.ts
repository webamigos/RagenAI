// Internal domain logic — not a server action. The caller must be a
// server-side context (page, route handler, or the action in
// src/app/.../organization/chatbots/actions.ts) so `organizationId`
// is always derived from the authenticated session and never trusted
// from a client payload.
import db from '@ragenai/prisma-client';
import { type CreateChatbotDto } from '../../contracts/chatbot.types';
import { assertFilesBelongToOrg } from '../../utils/assert-files-belong-to-org';

export const createChatbotCommand = async (
  organizationId: string,
  data: CreateChatbotDto,
) => {
  const selectedFileIds = data.selectedFileIds ?? [];
  await assertFilesBelongToOrg(selectedFileIds, organizationId);

  return db.chatbot.create({
    data: {
      organizationId,
      name: data.name,
      selectedFileIds,
      allowedOrigins: data.allowedOrigins ?? [],
      themeConfig: data.themeConfig ?? {},
    },
    select: {
      id: true,
      name: true,
      widgetToken: true,
      allowedOrigins: true,
      themeConfig: true,
      selectedFileIds: true,
      isActive: true,
      createdAt: true,
    },
  });
};
