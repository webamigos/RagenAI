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
  projectInstruction?: string | null;
};

export const initializeConversationChain = async ({
  settings,
  projectInstruction,
}: InitializeConversationChainParams) => {
  try {
    const { apiKey, model, temperature, prompt } = settings;

    setSentryServiceTag(serviceName);
    setSentryContext('CHAIN_DATA', {
      model,
      temperature,
      prompt,
      hasProjectInstruction: !!projectInstruction,
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
        answerInstructions: prompt || '',
        projectInstruction: projectInstruction || '',
      },
    });
  } catch (error) {
    logger.error({ err: error }, 'Error initializing conversation chain');
    throw error;
  }
};
