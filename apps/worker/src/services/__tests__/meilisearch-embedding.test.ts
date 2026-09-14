import type { Mock } from 'vitest';
import type { Document } from '../../types/Document.js';
import { meilisearch } from '../meilisearch.js';
import { VECTOR_SIZE } from '@ragenai/rag-core';

/* eslint-disable no-var */
var mockEmbedMany: Mock;
var mockWithLangfuseTrace: Mock;
var mockGetEmbeddingModelForOrg: Mock;
var mockAddDocuments: Mock;
var mockWaitForTask: Mock;
var mockWarn: Mock;
var mockUpdateSettings: Mock;
/* eslint-enable no-var */

vi.mock('ai', () => ({
  embedMany: (...args: unknown[]) => mockEmbedMany(...args),
}));

vi.mock('../../services/llm/index.js', () => ({
  getEmbeddingModelForOrg: (...args: unknown[]) =>
    mockGetEmbeddingModelForOrg(...args),
}));

vi.mock('../../services/langfuse-trace.js', () => ({
  withLangfuseTrace: (_opts: unknown, fn: () => unknown) =>
    mockWithLangfuseTrace(_opts, fn),
}));

vi.mock('../../services/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: (...args: unknown[]) => mockWarn(...args),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// The source does `new MeiliSearch(...)`. An arrow function has no
// [[Construct]], so vitest rejects it as a constructor where jest's mock
// happily accepted one — hence the `function` expression.
vi.mock('meilisearch', () => ({
  MeiliSearch: vi.fn(function () {
    return {
      index: vi.fn(() => ({
        getRawInfo: vi.fn(async () => ({})),
        updateSettings: (...args: unknown[]) => mockUpdateSettings(...args),
        addDocuments: (...args: unknown[]) => mockAddDocuments(...args),
      })),
      createIndex: vi.fn(async () => ({})),
      waitForTask: (...args: unknown[]) => mockWaitForTask(...args),
    };
  }),
}));

/** Texts handed to the embedding provider, flattened across batches. */
function embeddedTexts(): string[] {
  return mockEmbedMany.mock.calls.flatMap(
    (call) => (call[0] as { values: string[] }).values,
  );
}

function doc(pageContent: string): Document {
  return { pageContent, metadata: {} } as Document;
}

describe('meilisearch.addDocuments — embedding input', () => {
  const MAX_EMBEDDING_TEXT_CHARS = 2000;
  const EMBED_BATCH_SIZE = 96;

  beforeEach(() => {
    mockWarn = vi.fn();
    mockUpdateSettings = vi.fn(async () => ({}));
    mockAddDocuments = vi.fn(async () => ({ taskUid: 1 }));
    mockWaitForTask = vi.fn(async () => undefined);
    mockGetEmbeddingModelForOrg = vi.fn(async () => 'model');
    mockWithLangfuseTrace = vi.fn((_opts: unknown, fn: () => unknown) => fn());
    mockEmbedMany = vi.fn(async ({ values }: { values: string[] }) => ({
      embeddings: values.map(() => [0.1]),
      usage: { tokens: values.length },
    }));
  });

  /**
   * The regression this file exists for: this branch batched but never
   * truncated, so the same oversized chunk was embedded whole here and cut at
   * 2000 characters on the Qdrant path.
   */
  it('truncates an oversized chunk before embedding it', async () => {
    const long = 'A'.repeat(MAX_EMBEDDING_TEXT_CHARS + 500);

    await meilisearch.addDocuments({ orgId: 'org-1', docs: [doc(long)] });

    expect(embeddedTexts()[0]).toHaveLength(MAX_EMBEDDING_TEXT_CHARS);
    expect(embeddedTexts()[0]).toBe(long.slice(0, MAX_EMBEDDING_TEXT_CHARS));
  });

  it('warns when it truncates, naming both lengths', async () => {
    await meilisearch.addDocuments({
      orgId: 'org-1',
      docs: [doc('A'.repeat(2500))],
    });

    expect(mockWarn).toHaveBeenCalledWith(
      expect.objectContaining({
        orgId: 'org-1',
        originalLength: 2500,
        maxLength: MAX_EMBEDDING_TEXT_CHARS,
      }),
      expect.stringContaining('Truncating'),
    );
  });

  it('leaves a chunk within the limit untouched', async () => {
    await meilisearch.addDocuments({ orgId: 'org-1', docs: [doc('short')] });

    expect(embeddedTexts()).toEqual(['short']);
    expect(mockWarn).not.toHaveBeenCalled();
  });

  it('splits at the provider batch limit rather than one oversized call', async () => {
    const docs = Array.from({ length: EMBED_BATCH_SIZE + 10 }, (_, i) =>
      doc(`chunk-${i}`),
    );

    await meilisearch.addDocuments({ orgId: 'org-1', docs });

    expect(mockEmbedMany).toHaveBeenCalledTimes(2);
    expect(
      (mockEmbedMany.mock.calls[0][0] as { values: string[] }).values,
    ).toHaveLength(EMBED_BATCH_SIZE);
    expect(
      (mockEmbedMany.mock.calls[1][0] as { values: string[] }).values,
    ).toHaveLength(10);
  });

  it('keeps document order across batch boundaries', async () => {
    const docs = Array.from({ length: 150 }, (_, i) => doc(`chunk-${i}`));

    await meilisearch.addDocuments({ orgId: 'org-1', docs });

    expect(embeddedTexts()).toEqual(docs.map((d) => d.pageContent));
  });

  it('sums token usage over every batch', async () => {
    const docs = Array.from({ length: 150 }, (_, i) => doc(`chunk-${i}`));

    const result = await meilisearch.addDocuments({ orgId: 'org-1', docs });

    expect(result.inputTokens).toBe(150);
  });

  /**
   * The embedder dimension was hard-coded to 1024 while VECTOR_SIZE defaulted
   * to 3584 — Meilisearch was told to expect vectors a different size than the
   * model produces.
   */
  it('configures the embedder with the shared VECTOR_SIZE, not a literal', async () => {
    await meilisearch.addDocuments({ orgId: 'org-1', docs: [doc('hello')] });

    expect(mockUpdateSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        embedders: expect.objectContaining({
          custom: expect.objectContaining({ dimensions: VECTOR_SIZE }),
        }),
      }),
    );
  });

  it('does not call the provider at all for an empty document list', async () => {
    const result = await meilisearch.addDocuments({ orgId: 'org-1', docs: [] });

    expect(mockEmbedMany).not.toHaveBeenCalled();
    expect(result).toEqual({ inputTokens: 0 });
  });
});
