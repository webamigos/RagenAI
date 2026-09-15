import { embed, embedMany } from 'ai';
import { type TrackAiUsage } from '../ai-usage/types.js';
import type { EmbeddingsProvider } from './types/index.js';

export class TrackedEmbeddingsProvider implements EmbeddingsProvider {
  readonly model: string;
  /**
   * Accepted as a promise as well as a value.
   *
   * The gateway resolves a model asynchronously — credentials come from a
   * `CredentialSource` that will be the token vault — while every caller of
   * `createEmbeddingsInstance` is synchronous. Awaiting here, where the work is
   * already async, keeps all of them unchanged.
   */
  private embeddingModel: PromiseLike<Parameters<typeof embed>[0]['model']>;
  private organizationId?: string;
  private userId?: string;
  private projectId?: string;
  private provider: string;
  // Optional injected callback instead of a global trackAiUsage import — keeps
  // this class framework-agnostic (no NestJS DI). See ai-usage/types.ts.
  private trackAiUsage?: TrackAiUsage;

  constructor(
    embeddingModel:
      | Parameters<typeof embed>[0]['model']
      | PromiseLike<Parameters<typeof embed>[0]['model']>,
    modelName: string,
    provider: string,
    organizationId?: string,
    userId?: string,
    projectId?: string,
    trackAiUsage?: TrackAiUsage,
  ) {
    this.embeddingModel = Promise.resolve(embeddingModel);
    this.model = modelName;
    this.provider = provider;
    this.organizationId = organizationId;
    this.userId = userId;
    this.projectId = projectId;
    this.trackAiUsage = trackAiUsage;
  }

  private async trackEmbeddingUsage(tokens: number): Promise<void> {
    if (!this.organizationId || !this.trackAiUsage) {
      return;
    }
    await this.trackAiUsage({
      organizationId: this.organizationId,
      userId: this.userId,
      projectId: this.projectId,
      step: 'EMBEDDINGS',
      provider: this.provider,
      model: this.model,
      inputTokens: tokens,
      outputTokens: 0,
      totalTokens: tokens,
    });
  }

  async embedDocuments(texts: string[]): Promise<number[][]> {
    const { embeddings, usage } = await embedMany({
      model: await this.embeddingModel,
      values: texts,
    });

    if (usage) {
      await this.trackEmbeddingUsage(usage.tokens);
    }

    return embeddings;
  }

  async embedQuery(text: string): Promise<number[]> {
    const { embedding, usage } = await embed({
      model: await this.embeddingModel,
      value: text,
    });

    if (usage) {
      await this.trackEmbeddingUsage(usage.tokens);
    }

    return embedding;
  }
}
