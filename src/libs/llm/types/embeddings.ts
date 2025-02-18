import type { BedrockEmbeddingsParams } from '@langchain/aws';
import { Embeddings } from '@langchain/core/embeddings';
import type { OpenAIEmbeddingsParams } from '@langchain/openai';

export type BaseEmbeddingsConfig = Omit<
  BedrockEmbeddingsParams | OpenAIEmbeddingsConfig,
  'credentials' | 'apiKey'
>;

export type OpenAIEmbeddingsConfig = Omit<OpenAIEmbeddingsParams, 'modelName'>;

export type EmbeddingsWithModel = Embeddings & {
  model: string;
};
