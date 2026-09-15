import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const nativeChatModel = vi.hoisted(() =>
  vi.fn((_gateway: unknown, _request: unknown) => ({ id: 'native' })),
);
const resolveEmbeddingModel = vi.hoisted(() =>
  vi.fn(async () => ({ id: 'native-embedding' })),
);
const gatewayFromEnv = vi.hoisted(() =>
  vi.fn(() => ({ resolveEmbeddingModel })),
);

vi.mock('@ragenai/llm-gateway', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@ragenai/llm-gateway')>();
  return { ...actual, gatewayFromEnv, nativeChatModel };
});

import { nativeChatInstance, nativeEmbeddingInstance } from '../native-models';

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
   * `supportsReasoningEffort` is the catalogue's answer, and the package must
   * not grow its own copy — passing a real function rather than a flag is what
   * keeps `MODEL_REGISTRY` out of `@ragenai/llm-gateway`.
   */
  it('injects the catalogue answer rather than a boolean', () => {
    nativeChatInstance({ model: 'gpt-oss-120b' });

    const request = nativeChatModel.mock.calls[0]![1] as {
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

  it('leaves the scope unset when there is no organization', () => {
    nativeChatInstance({ model: 'gpt-oss-120b' });

    expect(nativeChatModel).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ scope: undefined }),
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
