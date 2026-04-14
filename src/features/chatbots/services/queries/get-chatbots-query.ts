import db from '@ragenai/prisma-client';

export const getChatbotsQuery = async (organizationId: string) => {
  return db.chatbot.findMany({
    where: { organizationId },
    select: {
      id: true,
      name: true,
      widgetToken: true,
      allowedOrigins: true,
      themeConfig: true,
      selectedFileIds: true,
      isActive: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: { createdAt: 'desc' },
  });
};
