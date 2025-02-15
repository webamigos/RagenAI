import { ChatCompletionFactory, type ProviderCredentials } from '@/libs/llm';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { ChatOpenAIFields, OpenAIEmbeddings } from '@langchain/openai';
import { OpenAIModerationChain } from 'langchain/chains';
import { OpenAIModerationChainInput } from 'langchain/dist/chains/openai_moderation';
import type { EmbeddingCreateParams } from 'openai/resources/embeddings';
import { usageTracker } from './usage';

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
  options: ChatOpenAIFields, //todo use BaseCompletionConfig
  streaming: boolean = true
): BaseChatModel => {
  //todo temporal credentials
  const credentials: ProviderCredentials = {
    provider: 'bedrock',
    region: process.env.AWS_REGION!,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
    },
  };

  //todo remove this
  const model = 'anthropic.claude-3-haiku-20240307-v1:0';

  return ChatCompletionFactory.createInstance(credentials, {
    ...options,
    model,
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
