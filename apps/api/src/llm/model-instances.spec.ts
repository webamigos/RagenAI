import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The test that would notice `LLM_GATEWAY` doing nothing in this app.
 *
 * apps/api is the surface where a dead seam is hardest to spot by hand: it has
 * no eval harness pointed at it, so the gateway arm of the Phase B measurement
 * would never exercise this file. Asserting the branch directly, in both
 * directions, is the only thing standing in for that.
 */

const createInstance = vi.hoisted(() => vi.fn(() => ({ id: 'proxy-chat' })));
const embeddingsCreateInstance = vi.hoisted(() =>
  vi.fn(() => ({ id: 'proxy-embeddings' })),
);
const nativeChatInstance = vi.hoisted(() => vi.fn(() => ({ id: 'native' })));
const nativeEmbeddingInstance = vi.hoisted(() =>
  vi.fn(() => Promise.resolve({ id: 'native-embedding' })),
);
const TrackedEmbeddingsProvider = vi.hoisted(() =>
  vi.fn(function (this: Record<string, unknown>) {
    this.id = 'tracked';
  }),
);

vi.mock('./chat-completion-factory.js', () => ({
  ChatCompletionFactory: { createInstance },
}));

vi.mock('./embeddings-factory.js', () => ({
  EmbeddingsFactory: { createInstance: embeddingsCreateInstance },
  TrackedEmbeddingsProvider,
}));

vi.mock('./native-models.js', () => ({
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

const load = () => import('./model-instances.js');

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

    createEmbeddingsInstance({ organizationId: 'org_1' });

    expect(nativeEmbeddingInstance).toHaveBeenCalledWith(
      'qwen3-embedding-8b',
      'org_1',
    );
    expect(embeddingsCreateInstance).not.toHaveBeenCalled();
  });

  it('prices embeddings under the namespace the cost table actually has', async () => {
    const { createEmbeddingsInstance } = await load();
    const trackAiUsage = vi.fn();

    createEmbeddingsInstance({ organizationId: 'org_1' }, trackAiUsage);

    expect(TrackedEmbeddingsProvider).toHaveBeenCalledWith(
      expect.anything(),
      'qwen3-embedding-8b',
      'litellm',
      'org_1',
      undefined,
      undefined,
      trackAiUsage,
    );
  });

  /**
   * The gateway path never reads it. The env schema still requires it until
   * B4, but if this file reached for it, `LLM_GATEWAY=native` would not
   * actually be runnable without a proxy.
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
