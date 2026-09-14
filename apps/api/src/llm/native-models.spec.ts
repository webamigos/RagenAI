import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const nativeChatModel = vi.hoisted(() =>
  vi.fn((_gateway: unknown, _request: unknown) => ({ id: 'native' })),
);
const resolveEmbeddingModel = vi.hoisted(() =>
  vi.fn(() => Promise.resolve({ id: 'native-embedding' })),
);
const gatewayFromEnv = vi.hoisted(() =>
  vi.fn(() => ({ resolveEmbeddingModel })),
);

vi.mock('@ragenai/llm-gateway', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@ragenai/llm-gateway')>();
  return { ...actual, gatewayFromEnv, nativeChatModel };
});

const { nativeChatInstance, nativeEmbeddingInstance, usingNativeGateway } =
  await import('./native-models.js');

const originalGateway = process.env.LLM_GATEWAY;

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  if (originalGateway === undefined) {
    delete process.env.LLM_GATEWAY;
  } else {
    process.env.LLM_GATEWAY = originalGateway;
  }
});

describe('the api side of LLM_GATEWAY', () => {
  it('stays on the proxy unless asked otherwise', () => {
    delete process.env.LLM_GATEWAY;
    expect(usingNativeGateway()).toBe(false);
  });

  it('switches when the flag says native', () => {
    process.env.LLM_GATEWAY = 'native';
    expect(usingNativeGateway()).toBe(true);
  });
});

describe('building a native chat model', () => {
  it('passes the requested model and effort through', () => {
    nativeChatInstance({ model: 'gpt-oss-120b', reasoningEffort: 'high' });

    expect(nativeChatModel).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        modelId: 'gpt-oss-120b',
        reasoningEffort: 'high',
      }),
    );
  });

  /**
   * The catalogue is `@ragenai/platform-contracts` (ADR-33), reached here via
   * `model-registry.js`. Passing the function rather than a boolean is what
   * keeps that catalogue out of `@ragenai/llm-gateway`.
   */
  it('injects the catalogue answer rather than a boolean', () => {
    nativeChatInstance({ model: 'gpt-oss-120b' });

    const request = nativeChatModel.mock.calls[0][1] as {
      supportsReasoningEffort: unknown;
    };
    expect(typeof request.supportsReasoningEffort).toBe('function');
  });

  it('threads an organization id as a credential scope', () => {
    nativeChatInstance({ model: 'gpt-oss-120b', organizationId: 'org_1' });

    expect(nativeChatModel).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ scope: { organizationId: 'org_1' } }),
    );
  });

  it('refuses a missing model id instead of inventing one', () => {
    expect(() => nativeChatInstance({})).toThrow(/a model id is required/);
    expect(nativeChatModel).not.toHaveBeenCalled();
  });
});

describe('building a native embedding model', () => {
  it('resolves the configured model through the gateway', async () => {
    await nativeEmbeddingInstance('qwen3-embedding-8b', 'org_1');

    expect(resolveEmbeddingModel).toHaveBeenCalledWith('qwen3-embedding-8b', {
      scope: { organizationId: 'org_1' },
    });
  });

  it('leaves the scope unset when there is no organization', async () => {
    await nativeEmbeddingInstance('qwen3-embedding-8b');

    expect(resolveEmbeddingModel).toHaveBeenCalledWith('qwen3-embedding-8b', {
      scope: undefined,
    });
  });
});
