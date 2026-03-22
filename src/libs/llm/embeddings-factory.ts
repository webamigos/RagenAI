import { embed, embedMany } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import type {
  LiteLLMCredentials,
  BaseEmbeddingsConfig,
  EmbeddingsProvider,
} from './types';

/**
 * Wrapper around Vercel AI SDK embedding models that provides
 * a unified interface. Usage tracking is handled by LiteLLM
 * via the org's virtual key.
 */
class SimpleEmbeddingsProvider implements EmbeddingsProvider {
  readonly model: string;
  private embeddingModel: Parameters<typeof embed>[0]['model'];

  constructor(
    embeddingModel: Parameters<typeof embed>[0]['model'],
    modelName: string,
  ) {
    this.embeddingModel = embeddingModel;
    this.model = modelName;
  }

  async embedDocuments(texts: string[]): Promise<number[][]> {
    const { embeddings } = await embedMany({
      model: this.embeddingModel,
      values: texts,
    });
    return embeddings;
  }

  async embedQuery(text: string): Promise<number[]> {
    const { embedding } = await embed({
      model: this.embeddingModel,
      value: text,
    });
    return embedding;
  }
}

export class EmbeddingsFactory {
  static createInstance(
    credentials: LiteLLMCredentials,
    config: BaseEmbeddingsConfig,
    _organizationId?: string,
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
    return new SimpleEmbeddingsProvider(
      litellm.textEmbeddingModel(modelName),
      modelName,
    );
  }
}
