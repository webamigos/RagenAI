import type { ModerationInstance } from '@/app/lib/services/llm';
import type { EmbeddingsProvider } from '@/libs/llm/types/embeddings';
import type { LiteLLMCredentials } from '@/libs/llm/types/credentials';

export function getLiteLLMCredentials(): LiteLLMCredentials {
  return {
    provider: 'litellm',
    baseUrl: process.env.LITELLM_PROXY_URL || 'http://localhost:4000',
    apiKey: process.env.LITELLM_MASTER_KEY,
  };
}

/**
 * No-op moderation that never flags content.
 * Used in evals so red-team prompts reach the LLM.
 */
export function createNoopModeration(): ModerationInstance {
  return {
    async invoke() {
      return {
        results: [
          { flagged: false, categories: {} as Record<string, boolean> },
        ],
      };
    },
  };
}

/**
 * No-op embeddings provider. Returns zero vectors.
 * Used when thread documents are empty (default eval case).
 */
export function createNoopEmbeddings(): EmbeddingsProvider {
  return {
    model: 'noop',
    async embedDocuments(texts: string[]): Promise<number[][]> {
      return texts.map(() => new Array(1536).fill(0));
    },
    async embedQuery(): Promise<number[]> {
      return new Array(1536).fill(0);
    },
  };
}
