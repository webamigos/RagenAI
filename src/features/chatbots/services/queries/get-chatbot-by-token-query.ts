import db from '@ragenai/prisma-client';

export const getChatbotByTokenQuery = async (widgetToken: string) => {
  return db.chatbot.findUnique({
    where: { widgetToken, isActive: true },
    select: {
      id: true,
      organizationId: true,
      name: true,
      selectedFileIds: true,
      allowedOrigins: true,
      themeConfig: true,
    },
  });
};
