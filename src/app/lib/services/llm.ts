import {
  ChatOpenAI,
  ChatOpenAIFields,
  OpenAIEmbeddings,
} from '@langchain/openai';
import { OpenAIModerationChain } from 'langchain/chains';
import { OpenAIModerationChainInput } from 'langchain/dist/chains/openai_moderation';
import { usageTracker } from './usage';

const verbose = process.env.NODE_ENV === 'development';

export const createChatCompletionInstance = (
  options: ChatOpenAIFields,
  streaming: boolean = true
) => {
  if (!options.apiKey) {
    throw new Error('Cannot create chat instance, apiKey is required');
  }

  return new ChatOpenAI({
    ...options,
    verbose,
    streaming,
    callbacks: [
      {
        handleLLMEnd: (output) => {
          usageTracker.trackChatCompletionTokens(output);
        },
      },
    ],
  });
};

export const createModerationInstance = (
  options: OpenAIModerationChainInput
) => {
  if (!options.apiKey) {
    throw new Error('Cannot create moderation instance, apiKey is required');
  }

  return new OpenAIModerationChain({ ...options, verbose });
};

export const createEmbeddingsInstance = ({ apiKey }: { apiKey: string }) => {
  if (!apiKey) {
    throw new Error('Cannot create embeddings instance, apiKey is required');
  }

  return new OpenAIEmbeddings({
    apiKey,
    model: 'text-embedding-3-small',
  });
};
