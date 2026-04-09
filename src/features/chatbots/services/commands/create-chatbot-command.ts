'use server';

import db from '@ragenai/prisma-client';
import { type CreateChatbotDto } from '../../contracts/chatbot.types';

export const createChatbotCommand = async (
  organizationId: string,
  data: CreateChatbotDto,
) => {
  return db.chatbot.create({
    data: {
      organizationId,
      name: data.name,
      selectedFileIds: data.selectedFileIds ?? [],
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
