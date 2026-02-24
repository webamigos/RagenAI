import { embed, embedMany } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { createAmazonBedrock } from '@ai-sdk/amazon-bedrock';
import type { EmbeddingModelV3 } from '@ai-sdk/provider';
import { UsageTracker } from '@/app/lib/utils/usage/usage-tracker';
import type {
  BedrockCredentials,
  OpenAICredentials,
  ProviderCredentials,
  BaseEmbeddingsConfig,
  EmbeddingsProvider,
} from './types';

/**
 * Wrapper around Vercel AI SDK embedding models that provides
 * a unified interface with usage tracking.
 */
export class TrackedEmbeddingsProvider implements EmbeddingsProvider {
  readonly model: string;
  private embeddingModel: EmbeddingModelV3;
  private usageTracker?: UsageTracker;

  constructor(
    embeddingModel: EmbeddingModelV3,
    modelName: string,
    usageTracker?: UsageTracker
  ) {
    this.embeddingModel = embeddingModel;
    this.model = modelName;
    this.usageTracker = usageTracker;
  }

  async embedDocuments(texts: string[]): Promise<number[][]> {
    const { embeddings, usage } = await embedMany({
      model: this.embeddingModel,
      values: texts,
    });

    if (usage && this.usageTracker) {
      this.usageTracker.incEmbeddingsTokens({
        prompt_tokens: usage.tokens,
        total_tokens: usage.tokens,
      });
    }

    return embeddings;
  }

  async embedQuery(text: string): Promise<number[]> {
    const { embedding, usage } = await embed({
      model: this.embeddingModel,
      value: text,
    });

    if (usage && this.usageTracker) {
      this.usageTracker.incEmbeddingsTokens({
        prompt_tokens: usage.tokens,
        total_tokens: usage.tokens,
      });
    }

    return embedding;
  }
}

export class EmbeddingsFactory {
  private static createBedrockInstance(
    credentials: BedrockCredentials,
    config: BaseEmbeddingsConfig,
    usageTracker?: UsageTracker
  ): EmbeddingsProvider {
    if (!credentials.credentials) {
      throw new Error('Credentials are required for Bedrock');
    }

    if (!credentials.region) {
      throw new Error('Region is required for Bedrock');
    }

    const bedrock = createAmazonBedrock({
      region: credentials.region,
      accessKeyId: credentials.credentials.accessKeyId,
      secretAccessKey: credentials.credentials.secretAccessKey,
    });

    const modelName = config.model || 'amazon.titan-embed-text-v1';
    return new TrackedEmbeddingsProvider(
      bedrock.textEmbeddingModel(modelName),
      modelName,
      usageTracker
    );
  }

  private static createOpenAIInstance(
    credentials: OpenAICredentials,
    config: BaseEmbeddingsConfig,
    usageTracker?: UsageTracker
  ): EmbeddingsProvider {
    if (!credentials.apiKey) {
      throw new Error('API key is required for OpenAI');
    }

    const openai = createOpenAI({
      apiKey: credentials.apiKey,
    });

    const modelName = config.model || 'text-embedding-3-small';
    return new TrackedEmbeddingsProvider(
      openai.textEmbeddingModel(modelName),
      modelName,
      usageTracker
    );
  }

  static createInstance(
    credentials: ProviderCredentials,
    config: BaseEmbeddingsConfig,
    usageTracker?: UsageTracker
  ): EmbeddingsProvider {
    switch (credentials.provider) {
      case 'bedrock':
        return this.createBedrockInstance(credentials, config, usageTracker);

      case 'openai':
        return this.createOpenAIInstance(credentials, config, usageTracker);

      default:
        throw new Error('Unsupported provider');
    }
  }
}
