/**
 * The vector-store contract shared by ragen-app, apps/api and apps/worker.
 *
 * The worker writes vectors; the app and the api query them. Every value here
 * has to be identical on both sides or retrieval breaks *silently* — nothing
 * throws, results just get worse. These used to be duplicated constants in
 * three files, which is exactly how they drift. See ADR-26.
 */
/** Named vector for the dense embedding in every Qdrant point. */
export declare const DENSE_VECTOR_NAME = 'dense';
/** Named vector for the BM25 sparse embedding in every Qdrant point. */
export declare const SPARSE_VECTOR_NAME = 'sparse';
/** Points per upsert batch. */
export declare const BATCH_SIZE = 100;
/**
 * Over-fetch multiplier per prefetch branch, so RRF fusion has enough
 * candidates to actually re-rank rather than just re-ordering a short list.
 */
export declare const PREFETCH_MULTIPLIER = 4;
/**
 * Default embedding model. Its output dimensionality must match
 * {@link VECTOR_SIZE} — these two defaults disagreed until ADR-26 phase 2
 * (this was `cohere-embed-multilingual-v3` at 1024 dims against a 3584-dim
 * collection), so an install that set neither variable had every Qdrant upsert
 * rejected. Change one and you must change the other.
 */
export declare const DEFAULT_EMBEDDINGS_MODEL = 'bge-multilingual-gemma2';
/** Dimensionality of {@link DEFAULT_EMBEDDINGS_MODEL}. */
export declare const DEFAULT_VECTOR_SIZE = 3584;
/**
 * Dense vector dimensionality for Qdrant collections.
 *
 * Read once at module load, matching the previous per-app behaviour. Override
 * with `VECTOR_SIZE` only alongside a matching `EMBEDDINGS_MODEL`; a mismatch
 * makes Qdrant reject every upsert.
 */
export declare const VECTOR_SIZE: number;
//# sourceMappingURL=vector-contract.d.ts.map
