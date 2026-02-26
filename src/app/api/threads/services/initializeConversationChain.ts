import { type OrganizationSettings } from '@/features/organizations/contracts/organization.types';
import {
  createChatCompletionInstance,
  createModerationInstance,
} from '@/app/lib/services/llm';
import { logger } from '@/app/lib/utils/logger';
import { conversationChain } from '@/libs/chains/conversation-chain/chain';

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

    return await conversationChain({
      models: {
        contentModerator: createModerationInstance(),
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
