'use strict';
/**
 * The vector-store contract shared by ragen-app, apps/api and apps/worker.
 *
 * The worker writes vectors; the app and the api query them. Every value here
 * has to be identical on both sides or retrieval breaks *silently* — nothing
 * throws, results just get worse. These used to be duplicated constants in
 * three files, which is exactly how they drift. See ADR-26.
 */
Object.defineProperty(exports, '__esModule', { value: true });
exports.VECTOR_SIZE =
  exports.DEFAULT_VECTOR_SIZE =
  exports.DEFAULT_EMBEDDINGS_MODEL =
  exports.PREFETCH_MULTIPLIER =
  exports.BATCH_SIZE =
  exports.SPARSE_VECTOR_NAME =
  exports.DENSE_VECTOR_NAME =
    void 0;
/** Named vector for the dense embedding in every Qdrant point. */
exports.DENSE_VECTOR_NAME = 'dense';
/** Named vector for the BM25 sparse embedding in every Qdrant point. */
exports.SPARSE_VECTOR_NAME = 'sparse';
/** Points per upsert batch. */
exports.BATCH_SIZE = 100;
/**
 * Over-fetch multiplier per prefetch branch, so RRF fusion has enough
 * candidates to actually re-rank rather than just re-ordering a short list.
 */
exports.PREFETCH_MULTIPLIER = 4;
/**
 * Default embedding model. Its output dimensionality must match
 * {@link VECTOR_SIZE} — these two defaults disagreed until ADR-26 phase 2
 * (this was `cohere-embed-multilingual-v3` at 1024 dims against a 3584-dim
 * collection), so an install that set neither variable had every Qdrant upsert
 * rejected. Change one and you must change the other.
 */
exports.DEFAULT_EMBEDDINGS_MODEL = 'bge-multilingual-gemma2';
/** Dimensionality of {@link DEFAULT_EMBEDDINGS_MODEL}. */
exports.DEFAULT_VECTOR_SIZE = 3584;
function readVectorSize() {
  const raw = process.env.VECTOR_SIZE;
  if (raw === undefined || raw === '') {
    return exports.DEFAULT_VECTOR_SIZE;
  }
  // Validate rather than letting parseInt turn "3584abc" into 3584 or "abc"
  // into NaN — a bad value here is far easier to diagnose at startup than as a
  // stream of rejected upserts later.
  if (!/^[1-9]\d*$/.test(raw)) {
    throw new Error(
      `Invalid VECTOR_SIZE env var: "${raw}" — must be a positive integer ` +
        `(e.g. ${exports.DEFAULT_VECTOR_SIZE} for ${exports.DEFAULT_EMBEDDINGS_MODEL}, 1024 for cohere-embed-multilingual-v3)`,
    );
  }
  return Number(raw);
}
/**
 * Dense vector dimensionality for Qdrant collections.
 *
 * Read once at module load, matching the previous per-app behaviour. Override
 * with `VECTOR_SIZE` only alongside a matching `EMBEDDINGS_MODEL`; a mismatch
 * makes Qdrant reject every upsert.
 */
exports.VECTOR_SIZE = readVectorSize();
//# sourceMappingURL=vector-contract.js.map
