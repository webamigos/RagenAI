import { embed, embedMany } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import type { EmbeddingModelV3 } from '@ai-sdk/provider';
import { AiUsageStep } from '@/generated/prisma/client';
import { trackAiUsage } from '@/features/ai-usage/services/commands/create-ai-usage-command';
import type {
  LiteLLMCredentials,
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
  static createInstance(
    credentials: LiteLLMCredentials,
    config: BaseEmbeddingsConfig,
    organizationId?: string,
  ): EmbeddingsProvider {
    if (!credentials.baseUrl) {
      throw new Error('LiteLLM baseUrl is required for embeddings');
    }

    const baseUrl = credentials.baseUrl.endsWith('/')
      ? credentials.baseUrl.slice(0, -1)
      : credentials.baseUrl;

    const litellm = createOpenAI({
      baseURL: `${baseUrl}/v1`,
      apiKey: credentials.apiKey || 'sk-litellm',
    });

    const modelName = config.model || 'cohere-embed-multilingual-v3';
    return new TrackedEmbeddingsProvider(
      litellm.textEmbeddingModel(modelName),
      modelName,
      'litellm',
      organizationId,
    );
  }
}
