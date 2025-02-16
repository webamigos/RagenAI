import { UsageTracker } from '@/app/lib/utils/usage/usage-tracker';
import { Embeddings } from '@langchain/core/embeddings';
import { OpenAIEmbeddingsParams } from '@langchain/openai';
import {
  TrackedBedrockEmbeddings,
  TrackedOpenAIEmbeddings,
} from './embeddings';

import type {
  BedrockCredentials,
  OpenAICredentials,
  ProviderCredentials,
  BaseEmbeddingsConfig,
} from './types';
import { BedrockEmbeddingsParams } from '@langchain/aws';

export class EmbeddingsFactory {
  private static createBedrockInstance(
    credentials: BedrockCredentials,
    config: BedrockEmbeddingsParams,
    usageTracker?: UsageTracker
  ): TrackedBedrockEmbeddings {
    if (!credentials.credentials) {
      throw new Error('Credentials are required for Bedrock');
    }

    if (!credentials.region) {
      throw new Error('Region is required for Bedrock');
    }

    return new TrackedBedrockEmbeddings(config, credentials, usageTracker);
  }

  private static createOpenAIInstance(
    credentials: OpenAICredentials,
    config: Omit<OpenAIEmbeddingsParams, 'modelName'>,
    usageTracker?: UsageTracker
  ): TrackedOpenAIEmbeddings {
    if (!credentials.apiKey) {
      throw new Error('API key is required for OpenAI');
    }

    return new TrackedOpenAIEmbeddings(config, credentials, usageTracker);
  }

  static createInstance(
    credentials: ProviderCredentials,
    config: BaseEmbeddingsConfig,
    usageTracker?: UsageTracker
  ): Embeddings {
    switch (credentials.provider) {
      case 'bedrock':
        return this.createBedrockInstance(
          credentials,
          config as BedrockEmbeddingsParams,
          usageTracker
        );

      case 'openai':
        return this.createOpenAIInstance(
          credentials,
          config as OpenAIEmbeddingsParams,
          usageTracker
        );

      default:
        throw new Error('Unsupported provider');
    }
  }
}
