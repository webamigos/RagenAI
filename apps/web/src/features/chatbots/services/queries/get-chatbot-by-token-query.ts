import db from '@ragenai/prisma-client';
import { isFeatureEnabledQuery } from '@/features/subscriptions/services/queries/get-effective-features-query';

/**
 * The single choke point for every `/api/chatbot/[token]/*` route (config,
 * chat, history, error), which is why the `publicChatbot` gate lives here
 * rather than in four handlers.
 *
 * Returning `null` — the same shape as an unknown or deactivated token — is
 * deliberate: the caller is an anonymous embed on someone else's website, and
 * a distinct "disabled" answer would tell it that this token is real.
 */
export const getChatbotByTokenQuery = async (widgetToken: string) => {
  const chatbot = await db.chatbot.findFirst({
    where: { widgetToken, isActive: true },
    select: {
      id: true,
      organizationId: true,
      name: true,
      selectedFileIds: true,
      allowedOrigins: true,
      themeConfig: true,
      chatbotPrompt: true,
    },
  });

  if (!chatbot) {
    return null;
  }

  const enabled = await isFeatureEnabledQuery(
    chatbot.organizationId,
    'publicChatbot',
  );

  return enabled ? chatbot : null;
};
