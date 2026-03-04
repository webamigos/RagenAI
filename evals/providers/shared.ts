import type { ModerationInstance } from '@/app/lib/services/llm';
import type { EmbeddingsProvider } from '@/libs/llm/types/embeddings';

const API_KEY_ENV_MAP: Record<string, string> = {
  openrouter: 'OPENROUTER_API_KEY',
  openai: 'OPENAI_API_KEY',
  anthropic: 'ANTHROPIC_API_KEY',
  google: 'GOOGLE_API_KEY',
  fireworks: 'FIREWORKS_API_KEY',
};

export function resolveApiKey(provider: string): string | undefined {
  return process.env[API_KEY_ENV_MAP[provider] ?? 'OPENAI_API_KEY'];
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
