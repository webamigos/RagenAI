import { OrganizationSettings } from '@/app/lib/types/settings';
import {
  createChatCompletionInstance,
  createModerationInstance,
} from '@/app/lib/services/llm';
import {
  setSentryContext,
  setSentryServiceTag,
} from '@/app/lib/services/sentry';
import { logger } from '@/app/lib/utils/logger';
import { conversationChain } from '@/libs/chains/conversation-chain/chain';

const serviceName = 'initializeConversationChain';

type InitializeConversationChainParams = {
  settings: OrganizationSettings;
};

export const initializeConversationChain = async ({
  settings,
}: InitializeConversationChainParams) => {
  try {
    const { apiKey, model, temperature, prompt } = settings;

    setSentryServiceTag(serviceName);
    setSentryContext('CHAIN_DATA', {
      model,
      temperature,
      prompt,
    });

    return await conversationChain({
      models: {
        contentModerator: createModerationInstance({ apiKey }),
        answerGenerator: createChatCompletionInstance({
          apiKey,
          model,
          temperature,
        }),
      },
      config: {
        answerInstructions: prompt,
      },
    });
  } catch (error) {
    logger.error({ err: error }, 'Error initializing conversation chain');
    throw error;
  }
};
