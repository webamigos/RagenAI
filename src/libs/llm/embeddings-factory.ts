import { embed, embedMany } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { AiUsageStep } from '@/generated/prisma/client';
import { trackAiUsage } from '@/features/ai-usage/services/commands/create-ai-usage-command';
import type {
  LiteLLMCredentials,
  BaseEmbeddingsConfig,
  EmbeddingsProvider,
} from './types';

export class TrackedEmbeddingsProvider implements EmbeddingsProvider {
  readonly model: string;
  private embeddingModel: Parameters<typeof embed>[0]['model'];
  private organizationId?: string;
  private userId?: string;
  private provider: string;

  constructor(
    embeddingModel: Parameters<typeof embed>[0]['model'],
    modelName: string,
    provider: string,
    organizationId?: string,
    userId?: string,
  ) {
    this.embeddingModel = embeddingModel;
    this.model = modelName;
    this.provider = provider;
    this.organizationId = organizationId;
    this.userId = userId;
  }

  private async trackEmbeddingUsage(tokens: number): Promise<void> {
    if (!this.organizationId) {
      return;
    }
    await trackAiUsage({
      organizationId: this.organizationId,
      userId: this.userId,
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
      await this.trackEmbeddingUsage(usage.tokens);
    }

    return embeddings;
  }

  async embedQuery(text: string): Promise<number[]> {
    const { embedding, usage } = await embed({
      model: this.embeddingModel,
      value: text,
    });

    if (usage) {
      await this.trackEmbeddingUsage(usage.tokens);
    }

    return embedding;
  }
}

export class EmbeddingsFactory {
  static createInstance(
    credentials: LiteLLMCredentials,
    config: BaseEmbeddingsConfig,
    organizationId?: string,
    userId?: string,
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
      // Force encoding_format='float'. Scaleway's vLLM-based embedding
      // endpoint rejects requests where this field is null/missing.
      // (Older comment here mentioned a Bedrock Cohere bug that needed the
      // field stripped — fixed upstream in LiteLLM, no longer relevant.)
      fetch: async (url, init) => {
        if (init?.body && typeof init.body === 'string') {
          try {
            const body = JSON.parse(init.body);
            body.encoding_format = 'float';
            init = { ...init, body: JSON.stringify(body) };
          } catch {
            // not JSON, pass through
          }
        }
        return fetch(url, init);
      },
    });

    const modelName = config.model || 'cohere-embed-multilingual-v3';
    return new TrackedEmbeddingsProvider(
      litellm.textEmbeddingModel(modelName),
      modelName,
      'litellm',
      organizationId,
      userId,
    );
  }
}
