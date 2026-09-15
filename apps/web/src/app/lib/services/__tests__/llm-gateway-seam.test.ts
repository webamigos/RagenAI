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
  usingNativeGateway: () => process.env.LLM_GATEWAY === 'native',
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

describe('LLM_GATEWAY=litellm (the default)', () => {
  beforeEach(() => {
    delete process.env.LLM_GATEWAY;
  });

  it('builds chat through the proxy factory', async () => {
    const { createChatCompletionInstance } = await load();

    createChatCompletionInstance({ model: 'gpt-oss-120b' });

    expect(createInstance).toHaveBeenCalledOnce();
    expect(nativeChatInstance).not.toHaveBeenCalled();
  });

  it('builds embeddings through the proxy factory', async () => {
    const { createEmbeddingsInstance } = await load();

    createEmbeddingsInstance({ organizationId: 'org_1' });

    expect(embeddingsCreateInstance).toHaveBeenCalledOnce();
    expect(nativeEmbeddingInstance).not.toHaveBeenCalled();
  });
});

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
   * So a run's `ai_usage` rows say which arm produced them, rather than the
   * arms being told apart only by when they were run.
   */
  it('records embeddings usage against the gateway, not the proxy', async () => {
    const { createEmbeddingsInstance } = await load();

    createEmbeddingsInstance({ organizationId: 'org_1' });

    expect(TrackedEmbeddingsProvider).toHaveBeenCalledWith(
      expect.anything(),
      'qwen3-embedding-8b',
      'llm-gateway',
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
