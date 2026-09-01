import { embed, embedMany } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { AiUsageStep } from '@/generated/prisma/client';
import { trackAiUsage } from '@/features/ai-usage/services/commands/create-ai-usage-command';
import type {
  LiteLLMCredentials,
  BaseEmbeddingsConfig,
  EmbeddingsProvider,
} from './types';
import { DEFAULT_EMBEDDINGS_MODEL } from '@ragenai/rag-core';

export class TrackedEmbeddingsProvider implements EmbeddingsProvider {
  readonly model: string;
  private embeddingModel: Parameters<typeof embed>[0]['model'];
  private organizationId?: string;
  private userId?: string;
  private projectId?: string;
  private provider: string;

  constructor(
    embeddingModel: Parameters<typeof embed>[0]['model'],
    modelName: string,
    provider: string,
    organizationId?: string,
    userId?: string,
    projectId?: string,
  ) {
    this.embeddingModel = embeddingModel;
    this.model = modelName;
    this.provider = provider;
    this.organizationId = organizationId;
    this.userId = userId;
    this.projectId = projectId;
  }

  private async trackEmbeddingUsage(tokens: number): Promise<void> {
    if (!this.organizationId) {
      return;
    }
    await trackAiUsage({
      organizationId: this.organizationId,
      userId: this.userId,
      projectId: this.projectId,
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
    projectId?: string,
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
      // Strip encoding_format from embedding requests to avoid LiteLLM/Bedrock Cohere bug
      // where embedding_types is sent as string instead of array
      fetch: async (url, init) => {
        if (init?.body && typeof init.body === 'string') {
          try {
            const body = JSON.parse(init.body);
            if (body.encoding_format !== undefined) {
              delete body.encoding_format;
              init = { ...init, body: JSON.stringify(body) };
            }
          } catch {
            // not JSON, pass through
          }
        }
        return fetch(url, init);
      },
    });

    // Last-resort fallback. Kept aligned with the callers' default and with
    // VECTOR_SIZE's 3584 default — a 1024-dim fallback here would silently
    // produce vectors Qdrant rejects. See ADR-26.
    const modelName = config.model || DEFAULT_EMBEDDINGS_MODEL;
    return new TrackedEmbeddingsProvider(
      litellm.textEmbeddingModel(modelName),
      modelName,
      'litellm',
      organizationId,
      userId,
      projectId,
    );
  }
}
