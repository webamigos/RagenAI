import { describe, expect, it, vi } from 'vitest';
import {
  EMBED_BATCH_SIZE,
  MAX_EMBEDDING_TEXT_CHARS,
  prepareEmbeddingBatches,
  truncateForEmbedding,
} from '../embedding-contract';

describe('truncateForEmbedding', () => {
  it('leaves text at or under the cap untouched', () => {
    const text = 'x'.repeat(MAX_EMBEDDING_TEXT_CHARS);
    expect(truncateForEmbedding(text)).toBe(text);
  });

  it('cuts text over the cap to exactly the cap', () => {
    const text = 'x'.repeat(MAX_EMBEDDING_TEXT_CHARS + 1);
    expect(truncateForEmbedding(text)).toHaveLength(MAX_EMBEDDING_TEXT_CHARS);
  });

  it('reports a truncation with the original and allowed lengths', () => {
    const onTruncate = vi.fn();
    truncateForEmbedding('x'.repeat(2500), onTruncate);

    expect(onTruncate).toHaveBeenCalledWith({
      originalLength: 2500,
      maxLength: MAX_EMBEDDING_TEXT_CHARS,
    });
  });

  it('stays silent when nothing was cut', () => {
    const onTruncate = vi.fn();
    truncateForEmbedding('short', onTruncate);

    expect(onTruncate).not.toHaveBeenCalled();
  });

  it('honours an explicit maxLength over the default', () => {
    expect(truncateForEmbedding('abcdef', undefined, 3)).toBe('abc');
  });
});

describe('prepareEmbeddingBatches', () => {
  it('keeps a short list in a single batch', () => {
    expect(prepareEmbeddingBatches(['a', 'b', 'c'])).toEqual([['a', 'b', 'c']]);
  });

  it('splits at the provider limit rather than sending one oversized call', () => {
    const texts = Array.from({ length: EMBED_BATCH_SIZE * 2 + 5 }, (_, i) =>
      String(i),
    );
    const batches = prepareEmbeddingBatches(texts);

    expect(batches).toHaveLength(3);
    expect(batches[0]).toHaveLength(EMBED_BATCH_SIZE);
    expect(batches[1]).toHaveLength(EMBED_BATCH_SIZE);
    expect(batches[2]).toHaveLength(5);
  });

  it('preserves order across batch boundaries', () => {
    const texts = Array.from({ length: 200 }, (_, i) => String(i));
    expect(prepareEmbeddingBatches(texts).flat()).toEqual(texts);
  });

  it('truncates while batching, so no batch carries an oversized text', () => {
    const batches = prepareEmbeddingBatches(['x'.repeat(5000), 'fine']);

    expect(batches[0][0]).toHaveLength(MAX_EMBEDDING_TEXT_CHARS);
    expect(batches[0][1]).toBe('fine');
  });

  it('returns no batches for no texts', () => {
    expect(prepareEmbeddingBatches([])).toEqual([]);
  });

  it('rejects a batch size that would never make progress', () => {
    expect(() => prepareEmbeddingBatches(['a'], { batchSize: 0 })).toThrow(
      /at least 1/,
    );
  });
});
