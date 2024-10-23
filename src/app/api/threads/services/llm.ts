import {
  ChatOpenAI,
  ChatOpenAIFields,
  OpenAIEmbeddings,
  OpenAIEmbeddingsParams,
} from '@langchain/openai';
import { OpenAIModerationChain } from 'langchain/chains';
import { OpenAIModerationChainInput } from 'langchain/dist/chains/openai_moderation';

const verbose = process.env.NODE_ENV === 'development';

export const createChatCompletionInstance = (options: ChatOpenAIFields) => {
  if (!options.apiKey) {
    throw new Error('Cannot create chat instance, apiKey is required');
  }

  return new ChatOpenAI({
    ...options,
    verbose,
    streaming: true,
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

export const createEmbeddingsInstance = (apiKey: string) => {
  if (!apiKey) {
    throw new Error('Cannot create embeddings instance, apiKey is required');
  }

  return new OpenAIEmbeddings({
    apiKey,
    model: 'text-embedding-3-small',
  });
};
