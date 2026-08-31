/**
 * BM25 sparse vector encoder for hybrid search in Qdrant.
 *
 * This is the single source of truth, shared by ragen-app, apps/api and
 * apps/worker. It used to exist as three hand-maintained copies, one per app —
 * a divergence in the tokenizer or the hash would make indexed terms and
 * queried terms land on different sparse indices, which is invisible except as
 * quietly worse search results. See ADR-26.
 *
 * Produces sparse vectors as { indices, values } where:
 *   - indices: FNV-1a 32-bit hashes of lowercased tokens (stable across processes)
 *   - values: raw term frequencies (Qdrant applies IDF server-side via `modifier: 'idf'`)
 *
 * Tokenization is unicode-aware so it works for mixed Polish/English content.
 * No stemming in v1 — matches exact word forms. Upgrade target is SPLADE.
 */
export interface SparseVector {
  indices: number[];
  values: number[];
}
/**
 * Tokenize text into lowercased unicode words.
 * Exported for testing; normal callers should use {@link encode}.
 */
export declare function tokenize(text: string): string[];
/**
 * FNV-1a 32-bit hash. Stable, fast, dependency-free.
 * Collision rate is negligible for realistic vocabularies (<1M unique tokens).
 *
 * Returns an unsigned 32-bit integer in [0, 2^32).
 */
export declare function fnv1a32(str: string): number;
/**
 * Encode text to a BM25 sparse vector. Collapses duplicate tokens into a
 * single (index, frequency) pair. Returns an empty vector for empty/whitespace
 * input — callers should treat this as "no sparse signal" and fall back to
 * dense-only retrieval.
 */
export declare function encode(text: string): SparseVector;
//# sourceMappingURL=bm25-encoder.d.ts.map
