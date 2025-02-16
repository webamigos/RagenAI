import { OpenAIEmbeddings } from '@langchain/openai';
import { UsageTracker } from '@/app/lib/utils/usage/usage-tracker';
import type { EmbeddingCreateParams } from 'openai/resources/embeddings';
import type { OpenAICredentials, OpenAIEmbeddingsConfig } from '../types';

//Based on LangChain implementation:
//https://github.com/langchain-ai/langchainjs/blob/main/libs/langchain-openai/src/embeddings.ts

export class TrackedOpenAIEmbeddings extends OpenAIEmbeddings {
  private usageTracker?: UsageTracker;

  constructor(
    params: OpenAIEmbeddingsConfig,
    credentials: OpenAICredentials,
    usageTracker?: UsageTracker
  ) {
    super({ ...params, apiKey: credentials.apiKey });
    this.usageTracker = usageTracker;
  }

  protected async embeddingWithRetry(request: EmbeddingCreateParams) {
    const response = await super.embeddingWithRetry(request);
    if (response.usage && this.usageTracker) {
      this.usageTracker.incEmbeddingsTokens(response.usage);
    }
    return response;
  }
}
