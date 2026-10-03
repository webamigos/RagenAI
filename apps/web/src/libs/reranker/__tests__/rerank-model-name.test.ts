import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/app/lib/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

/**
 * The model the RAG settings page names must be the one the active provider
 * calls and records in its usage rows. The page carried a literal
 * `cohere-rerank-v3-5` after Scaleway became the default, so every admin saw
 * a model their deployment never called. Both modules read RERANK_MODEL when
 * imported, hence the fresh import per case.
 */
async function rerankModelNameWith(env: Record<string, string | undefined>) {
  vi.resetModules();
  for (const [key, value] of Object.entries(env)) {
    vi.stubEnv(key, value as string);
  }
  const { rerankModelName } = await import('../index');
  return rerankModelName();
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('rerankModelName', () => {
  it('names the Scaleway model by default, with no provider set', async () => {
    expect(
      await rerankModelNameWith({
        RERANK_PROVIDER: undefined,
        RERANK_MODEL: undefined,
      }),
    ).toBe('qwen3-embedding-8b');
  });

  it('names Cohere only when the provider is cohere', async () => {
    expect(
      await rerankModelNameWith({
        RERANK_PROVIDER: 'cohere',
        RERANK_MODEL: undefined,
      }),
    ).toBe('cohere-rerank-v3-5');
  });

  it('follows RERANK_MODEL, as the reranker that records usage does', async () => {
    expect(
      await rerankModelNameWith({
        RERANK_PROVIDER: 'scaleway',
        RERANK_MODEL: 'some-rerank-model',
      }),
    ).toBe('some-rerank-model');
  });
});
