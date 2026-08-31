'use strict';
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
Object.defineProperty(exports, '__esModule', { value: true });
exports.tokenize = tokenize;
exports.fnv1a32 = fnv1a32;
exports.encode = encode;
/**
 * Match unicode letter-starting tokens with optional letters/digits after.
 * Examples: "faktura", "GPT4", "python3", "łódź". Punctuation and whitespace
 * are natural separators. Digits alone are dropped (low signal for BM25).
 */
const TOKEN_REGEX = /\p{L}[\p{L}\p{N}]*/gu;
/**
 * Tokenize text into lowercased unicode words.
 * Exported for testing; normal callers should use {@link encode}.
 */
function tokenize(text) {
  if (!text) {
    return [];
  }
  // NFKC normalization collapses visually-identical variants (e.g. full-width
  // forms, ligatures) to a canonical form before lowercasing.
  const normalized = text.normalize('NFKC').toLowerCase();
  const matches = normalized.match(TOKEN_REGEX);
  return matches ?? [];
}
/**
 * FNV-1a 32-bit hash. Stable, fast, dependency-free.
 * Collision rate is negligible for realistic vocabularies (<1M unique tokens).
 *
 * Returns an unsigned 32-bit integer in [0, 2^32).
 */
function fnv1a32(str) {
  let hash = 0x811c9dc5; // FNV offset basis
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    // 32-bit FNV prime multiplication via shifts to stay in int32 range
    hash =
      (hash +
        ((hash << 1) +
          (hash << 4) +
          (hash << 7) +
          (hash << 8) +
          (hash << 24))) >>>
      0;
  }
  return hash;
}
/**
 * Encode text to a BM25 sparse vector. Collapses duplicate tokens into a
 * single (index, frequency) pair. Returns an empty vector for empty/whitespace
 * input — callers should treat this as "no sparse signal" and fall back to
 * dense-only retrieval.
 */
function encode(text) {
  const tokens = tokenize(text);
  if (tokens.length === 0) {
    return { indices: [], values: [] };
  }
  const termFreqs = new Map();
  for (const token of tokens) {
    const hash = fnv1a32(token);
    termFreqs.set(hash, (termFreqs.get(hash) ?? 0) + 1);
  }
  const indices = [];
  const values = [];
  for (const [hash, freq] of termFreqs) {
    indices.push(hash);
    values.push(freq);
  }
  return { indices, values };
}
//# sourceMappingURL=bm25-encoder.js.map
