import { UsageTracker } from '@/app/lib/utils/usage/usage-tracker';
import { OpenAIEmbeddingsParams } from '@langchain/openai';
import {
  TrackedBedrockEmbeddings,
  TrackedOpenAIEmbeddings,
} from './embeddings';
import { OllamaEmbeddings, OllamaEmbeddingsParams } from '@langchain/ollama';

import type {
  BedrockCredentials,
  OpenAICredentials,
  ProviderCredentials,
  BaseEmbeddingsConfig,
  OllamaCredentials,
  EmbeddingsWithModel,
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

  private static createOllamaInstance(
    credentials: OllamaCredentials,
    config: OllamaEmbeddingsParams
  ): OllamaEmbeddings {
    if (!credentials.baseUrl) {
      throw new Error('Base URL is required for Ollama');
    }

    return new OllamaEmbeddings({ ...config, baseUrl: credentials.baseUrl });
  }
  static createInstance(
    credentials: ProviderCredentials,
    config: BaseEmbeddingsConfig,
    usageTracker?: UsageTracker
  ): EmbeddingsWithModel {
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

      //todo add tracker!
      case 'ollama':
        return this.createOllamaInstance(credentials, config);

      default:
        throw new Error('Unsupported provider');
    }
  }
}
