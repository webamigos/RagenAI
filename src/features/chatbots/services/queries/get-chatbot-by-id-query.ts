import db from '@ragenai/prisma-client';

export const getChatbotByIdQuery = async (
  id: string,
  organizationId: string,
) => {
  return db.chatbot.findFirst({
    where: { id, organizationId },
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
