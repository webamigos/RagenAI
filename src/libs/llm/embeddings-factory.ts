import { embed, embedMany } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { createAmazonBedrock } from '@ai-sdk/amazon-bedrock';
import type { EmbeddingModelV3 } from '@ai-sdk/provider';
import { AiUsageStep } from '@/generated/prisma/client';
import { trackAiUsage } from '@/features/ai-usage/services/commands/create-ai-usage-command';
import type {
  BedrockCredentials,
  OpenAICredentials,
  ProviderCredentials,
  BaseEmbeddingsConfig,
  EmbeddingsProvider,
} from './types';

/**
 * Wrapper around Vercel AI SDK embedding models that provides
 * a unified interface with usage tracking via AiUsage table.
 */
export class TrackedEmbeddingsProvider implements EmbeddingsProvider {
  readonly model: string;
  private embeddingModel: EmbeddingModelV3;
  private organizationId?: string;
  private provider: string;

  constructor(
    embeddingModel: EmbeddingModelV3,
    modelName: string,
    provider: string,
    organizationId?: string,
  ) {
    this.embeddingModel = embeddingModel;
    this.model = modelName;
    this.provider = provider;
    this.organizationId = organizationId;
  }

  private trackEmbeddingUsage(tokens: number): void {
    if (!this.organizationId) {
      return;
    }
    trackAiUsage({
      organizationId: this.organizationId,
      step: AiUsageStep.EMBEDDINGS,
      provider: this.provider,
      model: this.model,
      inputTokens: tokens,
      outputTokens: 0,
      totalTokens: tokens,
    });
  }

  async embedDocuments(texts: string[]): Promise<number[][]> {
    const { embeddings, usage } = await embedMany({
      model: this.embeddingModel,
      values: texts,
    });

    if (usage) {
      this.trackEmbeddingUsage(usage.tokens);
    }

    return embeddings;
  }

  async embedQuery(text: string): Promise<number[]> {
    const { embedding, usage } = await embed({
      model: this.embeddingModel,
      value: text,
    });

    if (usage) {
      this.trackEmbeddingUsage(usage.tokens);
    }

    return embedding;
  }
}

export class EmbeddingsFactory {
  private static createBedrockInstance(
    credentials: BedrockCredentials,
    config: BaseEmbeddingsConfig,
    organizationId?: string,
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
      'bedrock',
      organizationId,
    );
  }

  private static createOpenAIInstance(
    credentials: OpenAICredentials,
    config: BaseEmbeddingsConfig,
    organizationId?: string,
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
      'openai',
      organizationId,
    );
  }

  static createInstance(
    credentials: ProviderCredentials,
    config: BaseEmbeddingsConfig,
    organizationId?: string,
  ): EmbeddingsProvider {
    switch (credentials.provider) {
      case 'bedrock':
        return this.createBedrockInstance(credentials, config, organizationId);

      case 'openai':
        return this.createOpenAIInstance(credentials, config, organizationId);

      default:
        throw new Error('Unsupported provider');
    }
  }
}
