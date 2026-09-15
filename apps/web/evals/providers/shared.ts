import { nativeChatInstance } from '@/libs/llm/native-models';
import type { ModerationInstance } from '@/app/lib/services/llm';
import type { EmbeddingsProvider } from '@/libs/llm/types/embeddings';
import type { LiteLLMCredentials } from '@/libs/llm/types/credentials';

/**
 * Fallback model for eval providers when the config doesn't name one.
 *
 * Must be a route in `infra/llm-gateway/routes.yaml`, which is where model ids
 * resolve now — the proxy config this used to name went with B6.
 * `gemini-2.5-flash` is fast and cheap, which matters because the CI gate runs
 * on every PR touching the chains.
 */
export const DEFAULT_EVAL_MODEL = 'gemini-2.5-flash';

/**
 * The chat model an eval runs against.
 *
 * Built through the same gateway the application uses, so a suite measures the
 * product rather than a second code path that happens to resemble it. It used
 * to build a proxy client from `LITELLM_PROXY_URL`; B6 removed the proxy, and
 * the model id now resolves against `infra/llm-gateway/routes.yaml` like every
 * other call in the repository.
 */
export function evalChatModel(model: string) {
  return nativeChatInstance({ model });
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
      return texts.map(() => new Array(3584).fill(0));
    },
    async embedQuery(): Promise<number[]> {
      return new Array(3584).fill(0);
    },
  };
}
