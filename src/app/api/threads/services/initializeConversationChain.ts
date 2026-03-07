import { type OrganizationSettings } from '@/features/organizations/contracts/organization.types';
import {
  createChatCompletionInstance,
  createModerationInstance,
} from '@/app/lib/services/llm';
import { logger } from '@/app/lib/utils/logger';
import { conversationChain } from '@/libs/chains/conversation-chain/chain';
import type { ChainTrackingContext } from '@/libs/chains/types/common';

type InitializeConversationChainParams = {
  settings: OrganizationSettings;
  projectInstruction?: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mcpTools?: Record<string, any>;
  mcpContext?: string;
  tracking?: ChainTrackingContext;
};

export const initializeConversationChain = async ({
  settings,
  projectInstruction,
  mcpTools,
  mcpContext,
  tracking,
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
        mcpTools,
        mcpContext,
        tracking,
      },
    });
  } catch (error) {
    logger.error({ err: error }, 'Error initializing conversation chain');
    throw error;
  }
};
