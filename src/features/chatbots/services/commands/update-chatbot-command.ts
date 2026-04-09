'use server';

import db from '@ragenai/prisma-client';
import { type UpdateChatbotDto } from '../../contracts/chatbot.types';

export const updateChatbotCommand = async (
  id: string,
  organizationId: string,
  data: UpdateChatbotDto,
) => {
  const existing = await db.chatbot.findFirst({
    where: { id, organizationId },
    select: { id: true },
  });
  if (!existing) {
    return null;
  }

  return db.chatbot.update({
    where: { id },
    data: {
      ...(data.name !== undefined && { name: data.name }),
      ...(data.selectedFileIds !== undefined && {
        selectedFileIds: data.selectedFileIds,
      }),
      ...(data.allowedOrigins !== undefined && {
        allowedOrigins: data.allowedOrigins,
      }),
      ...(data.themeConfig !== undefined && { themeConfig: data.themeConfig }),
      ...(data.isActive !== undefined && { isActive: data.isActive }),
    },
    select: {
      id: true,
      name: true,
      widgetToken: true,
      allowedOrigins: true,
      themeConfig: true,
      selectedFileIds: true,
      isActive: true,
      organizationId: true,
      createdAt: true,
      updatedAt: true,
    },
  });
};
