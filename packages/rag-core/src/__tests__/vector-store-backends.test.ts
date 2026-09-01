import { describe, it, expect } from 'vitest';

import {
  DEFAULT_VECTOR_STORE,
  KNOWN_VECTOR_STORES,
  SUPPORTED_VECTOR_STORES,
  isKnownVectorStore,
  isSupportedVectorStore,
  resolveDefaultVectorStore,
} from '../vector-store-backends';

describe('vector store backends', () => {
  it('supports only what the ingest worker writes to', () => {
    // Widening this without teaching apps/worker to route by the same setting
    // reintroduces the silent-empty-retrieval failure — see ADR-31.
    expect([...SUPPORTED_VECTOR_STORES]).toEqual(['qdrant']);
    expect([...KNOWN_VECTOR_STORES]).toEqual([
      'qdrant',
      'meilisearch',
      'supabase',
    ]);
  });

  it('recognises the clients that exist without calling them supported', () => {
    expect(isKnownVectorStore('supabase')).toBe(true);
    expect(isSupportedVectorStore('supabase')).toBe(false);
    expect(isKnownVectorStore('pinecone')).toBe(false);
  });

  it('treats unset and blank as the default', () => {
    expect(resolveDefaultVectorStore({})).toBe(DEFAULT_VECTOR_STORE);
    expect(resolveDefaultVectorStore({ DEFAULT_VECTOR_STORE: '  ' })).toBe(
      DEFAULT_VECTOR_STORE,
    );
  });

  it('accepts a supported backend, trimmed', () => {
    expect(
      resolveDefaultVectorStore({ DEFAULT_VECTOR_STORE: ' qdrant ' }),
    ).toBe('qdrant');
  });

  it('refuses a known-but-unwritable backend, naming why', () => {
    // Falling back to qdrant would leave the operator believing their
    // configuration took effect.
    for (const backend of ['supabase', 'meilisearch']) {
      expect(() =>
        resolveDefaultVectorStore({ DEFAULT_VECTOR_STORE: backend }),
      ).toThrow(/writes to Qdrant only/);
    }
  });

  it('refuses a backend that does not exist at all', () => {
    expect(() =>
      resolveDefaultVectorStore({ DEFAULT_VECTOR_STORE: 'pinecone' }),
    ).toThrow(/Unknown DEFAULT_VECTOR_STORE/);
  });
});
