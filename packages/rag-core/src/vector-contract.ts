/**
 * The vector-store contract shared by ragen-app, apps/api and apps/worker.
 *
 * The worker writes vectors; the app and the api query them. Every value here
 * has to be identical on both sides or retrieval breaks *silently* — nothing
 * throws, results just get worse. These used to be duplicated constants in
 * three files, which is exactly how they drift. See ADR-26.
 */

/** Named vector for the dense embedding in every Qdrant point. */
export const DENSE_VECTOR_NAME = 'dense';

/** Named vector for the BM25 sparse embedding in every Qdrant point. */
export const SPARSE_VECTOR_NAME = 'sparse';

/** Points per upsert batch. */
export const BATCH_SIZE = 100;

/**
 * Over-fetch multiplier per prefetch branch, so RRF fusion has enough
 * candidates to actually re-rank rather than just re-ordering a short list.
 */
export const PREFETCH_MULTIPLIER = 4;

/**
 * Default embedding model. Its output dimensionality must match
 * {@link VECTOR_SIZE} — these two defaults disagreed until ADR-26 phase 2
 * (this was `cohere-embed-multilingual-v3` at 1024 dims against a 3584-dim
 * collection), so an install that set neither variable had every Qdrant upsert
 * rejected. Change one and you must change the other.
 */
export const DEFAULT_EMBEDDINGS_MODEL = 'bge-multilingual-gemma2';

/** Dimensionality of {@link DEFAULT_EMBEDDINGS_MODEL}. */
export const DEFAULT_VECTOR_SIZE = 3584;

function readVectorSize(): number {
  const raw = process.env.VECTOR_SIZE;
  if (raw === undefined || raw === '') {
    return DEFAULT_VECTOR_SIZE;
  }
  // Validate rather than letting parseInt turn "3584abc" into 3584 or "abc"
  // into NaN — a bad value here is far easier to diagnose at startup than as a
  // stream of rejected upserts later.
  if (!/^[1-9]\d*$/.test(raw)) {
    throw new Error(
      `Invalid VECTOR_SIZE env var: "${raw}" — must be a positive integer ` +
        `(e.g. ${DEFAULT_VECTOR_SIZE} for ${DEFAULT_EMBEDDINGS_MODEL}, 1024 for cohere-embed-multilingual-v3)`,
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
export const VECTOR_SIZE = readVectorSize();

/**
 * The embedding model this deployment uses, from `EMBEDDINGS_MODEL` or
 * {@link DEFAULT_EMBEDDINGS_MODEL}.
 *
 * A function rather than a constant so tests and long-lived processes see an
 * env change, matching how each app read it before. The point is that the
 * *fallback* lives in one place: `'bge-multilingual-gemma2'` was hard-coded as
 * a default in the worker, the API and two spots in the web app, which is the
 * same duplication that already caused a model/dimension mismatch once.
 */
export function resolveEmbeddingsModel(): string {
  const configured = process.env.EMBEDDINGS_MODEL?.trim();
  return configured ? configured : DEFAULT_EMBEDDINGS_MODEL;
}
