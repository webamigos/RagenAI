import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const nativeChatModel = vi.hoisted(() =>
  vi.fn((_gateway: unknown, _request: unknown) => ({ id: 'native' })),
);
const resolveEmbeddingModel = vi.hoisted(() =>
  vi.fn(() => Promise.resolve({ id: 'native-embedding' })),
);
const routeFor = vi.hoisted(() => vi.fn(() => undefined as unknown));
const gatewayFromEnv = vi.hoisted(() =>
  vi.fn(() => ({ resolveEmbeddingModel, routeFor })),
);

vi.mock('@ragenai/llm-gateway', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@ragenai/llm-gateway')>();
  return { ...actual, gatewayFromEnv, nativeChatModel };
});

const { nativeChatInstance, nativeEmbeddingInstance, servingProvider } =
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

describe('the provider that actually served a turn', () => {
  /**
   * This exists for `ai_usage.metadata.servedBy`. It must stay out of the
   * `provider` column: that is the key `calculateCost` looks pricing up under,
   * and the `litellm` namespace there holds the whole catalogue — so writing a
   * real provider into it would find no price and record every turn at zero.
   */

  it('is the route provider when the gateway serves the turn', () => {
    process.env.LLM_GATEWAY = 'native';
    routeFor.mockReturnValue({ provider: 'vertex' });

    expect(servingProvider('gemini-2.5-flash')).toBe('vertex');
  });

  it('is nothing for a model the route table does not know', () => {
    process.env.LLM_GATEWAY = 'native';
    routeFor.mockReturnValue(undefined);

    expect(servingProvider('not-routed')).toBeUndefined();
  });

  /** Attribution must never be the reason a turn fails to be recorded. */
  it('is nothing rather than a throw when the gateway cannot be built', () => {
    process.env.LLM_GATEWAY = 'native';
    gatewayFromEnv.mockImplementationOnce(() => {
      throw new Error('no route table');
    });

    expect(() => servingProvider('gpt-5.4')).not.toThrow();
    expect(servingProvider('gpt-5.4')).toBeUndefined();
  });
});
