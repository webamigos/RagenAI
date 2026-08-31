import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * VECTOR_SIZE is read once at module load, so every case re-imports the module
 * with a different env. Mutation testing flagged this whole file as untested
 * (ADR-26 shipped it with none), and the validation below is the kind of thing
 * that fails at 3am as "Qdrant rejected every upsert" rather than at startup.
 */
async function loadWith(vectorSize?: string) {
  vi.resetModules();
  if (vectorSize === undefined) {
    vi.stubEnv('VECTOR_SIZE', '');
  } else {
    vi.stubEnv('VECTOR_SIZE', vectorSize);
  }
  return import('../vector-contract');
}

describe('vector contract constants', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('names the dense and sparse vectors as Qdrant collections expect', async () => {
    const m = await loadWith();
    expect(m.DENSE_VECTOR_NAME).toBe('dense');
    expect(m.SPARSE_VECTOR_NAME).toBe('sparse');
  });

  it('exposes the upsert batch size and prefetch multiplier', async () => {
    const m = await loadWith();
    expect(m.BATCH_SIZE).toBe(100);
    expect(m.PREFETCH_MULTIPLIER).toBe(4);
  });

  // These two must agree or Qdrant rejects every upsert — they disagreed until
  // ADR-26 phase 2, which is why they live next to each other.
  it('pairs the default embedding model with its dimensionality', async () => {
    const m = await loadWith();
    expect(m.DEFAULT_EMBEDDINGS_MODEL).toBe('bge-multilingual-gemma2');
    expect(m.DEFAULT_VECTOR_SIZE).toBe(3584);
  });
});

describe('VECTOR_SIZE resolution', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('defaults to the dimensionality of the default model', async () => {
    const m = await loadWith();
    expect(m.VECTOR_SIZE).toBe(m.DEFAULT_VECTOR_SIZE);
  });

  it('treats a blank value as unset', async () => {
    const m = await loadWith('');
    expect(m.VECTOR_SIZE).toBe(3584);
  });

  it('accepts a valid override', async () => {
    const m = await loadWith('1024');
    expect(m.VECTOR_SIZE).toBe(1024);
  });

  // parseInt would have turned "3584abc" into 3584 and "abc" into NaN. The app
  // and api used parseInt before ADR-26 phase 3; the worker's strict version won.
  it.each(['3584abc', 'abc', '0', '-1', '3584.5', ' ', '1e3'])(
    'rejects %s rather than silently coercing it',
    async (value) => {
      await expect(loadWith(value)).rejects.toThrow('Invalid VECTOR_SIZE');
    },
  );

  it('names both the offending value and a valid example in the error', async () => {
    await expect(loadWith('nope')).rejects.toThrow(/"nope"/);
    await expect(loadWith('nope')).rejects.toThrow(/3584/);
  });
});
