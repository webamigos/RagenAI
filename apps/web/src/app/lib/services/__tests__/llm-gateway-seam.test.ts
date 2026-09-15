import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The one test that would notice `LLM_GATEWAY` doing nothing.
 *
 * Phase B's whole method is running the same questions down two paths and
 * comparing them per question. A flag that was read but never acted on would
 * produce two runs of the proxy arm and a comparison that found no difference
 * — which is also what a successful cutover looks like. So the seam is asserted
 * directly, in both directions, for chat and for embeddings.
 */

const createInstance = vi.hoisted(() => vi.fn(() => ({ id: 'proxy-chat' })));
const embeddingsCreateInstance = vi.hoisted(() =>
  vi.fn(() => ({ id: 'proxy-embeddings' })),
);
const nativeChatInstance = vi.hoisted(() => vi.fn(() => ({ id: 'native' })));
const nativeEmbeddingInstance = vi.hoisted(() =>
  vi.fn(async () => ({ id: 'native-embedding' })),
);
const TrackedEmbeddingsProvider = vi.hoisted(() =>
  vi.fn(function (this: Record<string, unknown>) {
    this.id = 'tracked';
  }),
);

vi.mock('@/libs/llm', () => ({
  ChatCompletionFactory: { createInstance },
}));

vi.mock('@/libs/llm/embeddings-factory', () => ({
  EmbeddingsFactory: { createInstance: embeddingsCreateInstance },
  TrackedEmbeddingsProvider,
}));

vi.mock('@/libs/llm/native-models', () => ({
  nativeChatInstance,
  nativeEmbeddingInstance,
  // Mirrors the real default, which is `native`. Written as `=== 'native'`
  // this double kept answering "proxy" for an unset value long after the
  // real function stopped — a test double that lies in exactly the
  // direction that makes the suite pass.
  usingNativeGateway: () => process.env.LLM_GATEWAY !== 'litellm',
}));

vi.mock('@ragenai/rag-core', () => ({
  resolveEmbeddingsModel: () => 'qwen3-embedding-8b',
  DEFAULT_EMBEDDINGS_MODEL: 'qwen3-embedding-8b',
}));

const saved = { ...process.env };

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  process.env.LITELLM_PROXY_URL = 'http://localhost:4000';
  process.env.DEFAULT_MODEL_PROVIDER = 'litellm';
  process.env.DEFAULT_MODEL = 'gemini-3-flash-preview';
});

afterEach(() => {
  process.env = { ...saved };
});

const load = () => import('../llm');

describe('LLM_GATEWAY=native', () => {
  beforeEach(() => {
    process.env.LLM_GATEWAY = 'native';
  });

  it('builds chat through the gateway', async () => {
    const { createChatCompletionInstance } = await load();

    createChatCompletionInstance({ model: 'gpt-oss-120b' });

    expect(nativeChatInstance).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'gpt-oss-120b' }),
    );
    expect(createInstance).not.toHaveBeenCalled();
  });

  it('builds embeddings through the gateway', async () => {
    const { createEmbeddingsInstance } = await load();

    createEmbeddingsInstance({ organizationId: 'org_1', userId: 'u_1' });

    expect(nativeEmbeddingInstance).toHaveBeenCalledWith(
      'qwen3-embedding-8b',
      'org_1',
    );
    expect(embeddingsCreateInstance).not.toHaveBeenCalled();
  });

  /**
   * `litellm` is the pricing namespace, not a gateway. It held `llm-gateway`
   * while the two arms were being told apart, and `calculateCost` has no such
   * namespace — so every embedding row was priced at zero, which is what the
   * monthly cost ceiling is computed from. The name moves when the pricing
   * table does, in B6b, and not before.
   */
  it('prices embeddings under the namespace the cost table actually has', async () => {
    const { createEmbeddingsInstance } = await load();

    createEmbeddingsInstance({ organizationId: 'org_1' });

    expect(TrackedEmbeddingsProvider).toHaveBeenCalledWith(
      expect.anything(),
      'qwen3-embedding-8b',
      'litellm',
      'org_1',
      undefined,
      undefined,
    );
  });

  /**
   * The proxy URL is the one variable the gateway path has no use for. It is
   * still required by the env schema until B4, but nothing on this path may
   * read it — otherwise `LLM_GATEWAY=native` would not actually be runnable
   * without a proxy.
   */
  it('needs no proxy URL', async () => {
    delete process.env.LITELLM_PROXY_URL;
    const { createChatCompletionInstance, createEmbeddingsInstance } =
      await load();

    expect(() =>
      createChatCompletionInstance({ model: 'gpt-oss-120b' }),
    ).not.toThrow();
    expect(() => createEmbeddingsInstance()).not.toThrow();
  });
});
