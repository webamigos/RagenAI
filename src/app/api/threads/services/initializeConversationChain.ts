import { type OrganizationSettings } from '@/features/organizations/contracts/organization.types';
import {
  createChatCompletionInstance,
  createModerationInstance,
} from '@/app/lib/services/llm';
import { logger } from '@/app/lib/utils/logger';
import { conversationChain } from '@/libs/chains/conversation-chain/chain';
import type { ChainTrackingContext } from '@/libs/chains/types/common';
import type { ThreadDocumentUI } from '@/features/documents/contracts/document.types';
import { getRagPipelineSettings } from '@/features/organizations/services/organization-settings';
import type { ReasoningEffortLevel } from '@/libs/llm/types';

type InitializeConversationChainParams = {
  settings: OrganizationSettings & { litellmApiKey?: string };
  orgId: string;
  projectInstruction?: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mcpTools?: Record<string, any>;
  mcpContext?: string;
  tracking?: ChainTrackingContext;
  threadDocuments?: ThreadDocumentUI[];
  reasoningEffort?: ReasoningEffortLevel;
};

export const initializeConversationChain = async ({
  settings,
  orgId,
  projectInstruction,
  mcpTools,
  mcpContext,
  tracking,
  threadDocuments,
  reasoningEffort,
}: InitializeConversationChainParams) => {
  try {
    const { apiKey, model, temperature, prompt, litellmApiKey } = settings;

    const ragPipelineSettings = await getRagPipelineSettings(orgId);

    return await conversationChain({
      models: {
        contentModerator: createModerationInstance(),
        answerGenerator: createChatCompletionInstance({
          apiKey,
          model,
          temperature,
          litellmApiKey,
          reasoningEffort,
        }),
      },
      config: {
        answerInstructions: prompt || '',
        projectInstruction: projectInstruction || '',
        mcpTools,
        mcpContext,
        tracking,
        threadDocuments,
        ragSettings: {
          multiQueryEnabled: ragPipelineSettings.multiQueryEnabled,
          contentModerationEnabled:
            ragPipelineSettings.contentModerationEnabled,
          rerankingEnabled: ragPipelineSettings.rerankingEnabled,
        },
      },
    });
  } catch (error) {
    logger.error({ err: error }, 'Error initializing conversation chain');
    throw error;
  }
};
