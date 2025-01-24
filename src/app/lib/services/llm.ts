import {
  ChatOpenAI,
  ChatOpenAIFields,
  OpenAIEmbeddings,
} from '@langchain/openai';
import { OpenAIModerationChain } from 'langchain/chains';
import { OpenAIModerationChainInput } from 'langchain/dist/chains/openai_moderation';
import { usageTracker } from './usage';
import type { EmbeddingCreateParams } from 'openai/resources/embeddings';

const verbose = process.env.NODE_ENV === 'development';

//Based on LangChain implementation:
//https://github.com/langchain-ai/langchainjs/blob/main/libs/langchain-openai/src/embeddings.ts
class TrackedOpenAIEmbeddings extends OpenAIEmbeddings {
  protected async embeddingWithRetry(request: EmbeddingCreateParams) {
    const response = await super.embeddingWithRetry(request);
    if (response.usage) {
      usageTracker.incEmbeddingsTokens(response.usage);
    }
    return response;
  }
}

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
          usageTracker.incChatCompletionTokens(output);
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

  return new OpenAIModerationChain({
    ...options,
    verbose,
  });
};

export const createEmbeddingsInstance = ({ apiKey }: { apiKey: string }) => {
  if (!apiKey) {
    throw new Error('Cannot create embeddings instance, apiKey is required');
  }

  return new TrackedOpenAIEmbeddings({
    apiKey,
    model: 'text-embedding-3-small',
  });
};
