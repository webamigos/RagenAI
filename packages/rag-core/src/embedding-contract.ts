/**
 * How text is prepared before it is handed to an embedding model.
 *
 * These limits belong next to {@link ./vector-contract} for the same reason:
 * getting them wrong degrades retrieval *silently*. Nothing throws when a
 * chunk is embedded from text that was truncated differently on the write side
 * than the read side — the answers just get worse.
 *
 * They were duplicated across `apps/worker/src/services/qdrant.ts` and
 * `apps/worker/src/services/meilisearch.ts`, and the two copies had already
 * diverged: qdrant.ts truncated oversized chunks, meilisearch.ts did not.
 *
 * Deliberately free of any dependency on the AI SDK. Creating the model is
 * application work — it needs organization settings and a LiteLLM key — so
 * each app still calls `embedMany` itself. What is shared here is the part
 * that has to agree.
 */

/**
 * Texts per `embedMany` call.
 *
 * Bedrock's Cohere embed endpoint rejects more than 96 values per request with
 * "Invalid parameter combination". The AI SDK's OpenAI adapter defaults to
 * 2048 and offers no override, so the batching has to happen at the call site.
 * Kept at 96 for every provider: the default model is Scaleway-hosted now, but
 * `RERANK_PROVIDER=cohere` puts Bedrock back in the path.
 *
 * Distinct from {@link ./vector-contract}'s `BATCH_SIZE`, which is points per
 * Qdrant *upsert*. Different limit, different service, different number.
 */
export const EMBED_BATCH_SIZE = 96;

/**
 * Hard character cap on a single text.
 *
 * Cohere's embed-multilingual-v3 allows 512 tokens per text. At roughly four
 * characters per token, 2000 characters keeps English content inside that;
 * multilingual text runs denser (Polish diacritics, markdown links), so this
 * is a defensive cap rather than an exact conversion. Splitters already aim
 * well below it — hitting this limit means something upstream produced an
 * unexpectedly large chunk.
 */
export const MAX_EMBEDDING_TEXT_CHARS = 2000;

/**
 * Guard for the two numeric options.
 *
 * `Number.isInteger` also rejects NaN and Infinity, which is the point: a
 * fractional batch size silently produces uneven batches, and NaN produces no
 * usable batches at all.
 */
function assertPositiveInteger(
  name: string,
  value: number,
  minimum: number,
): void {
  if (!Number.isInteger(value) || value < minimum) {
    throw new Error(
      `${name} must be an integer of at least ${minimum}, got ${value}`,
    );
  }
}

/** Called when {@link truncateForEmbedding} actually shortens something. */
export type TruncationReporter = (info: {
  originalLength: number;
  maxLength: number;
}) => void;

/**
 * Cap a single text at {@link MAX_EMBEDDING_TEXT_CHARS}.
 *
 * `onTruncate` exists because this is worth knowing about: it means a chunk
 * arrived larger than the splitter should ever produce, and the tail of it is
 * about to be dropped from the index.
 */
export function truncateForEmbedding(
  text: string,
  onTruncate?: TruncationReporter,
  maxLength: number = MAX_EMBEDDING_TEXT_CHARS,
): string {
  assertPositiveInteger('maxLength', maxLength, 1);
  if (text.length <= maxLength) {
    return text;
  }
  onTruncate?.({ originalLength: text.length, maxLength });
  return text.slice(0, maxLength);
}

/**
 * Split texts into provider-sized batches, truncating each one on the way.
 *
 * Returns batches rather than embedding them, so the caller keeps control of
 * the model, tracing and usage accounting — the parts that legitimately differ
 * between the worker and the API.
 */
export function prepareEmbeddingBatches(
  texts: string[],
  options: {
    onTruncate?: TruncationReporter;
    batchSize?: number;
    maxLength?: number;
  } = {},
): string[][] {
  const {
    onTruncate,
    batchSize = EMBED_BATCH_SIZE,
    maxLength = MAX_EMBEDDING_TEXT_CHARS,
  } = options;

  // Rejected rather than clamped, because every bad value here fails
  // *silently* in a way that empties the index: `batchSize: NaN` produced a
  // single empty batch, dropping every text, and a NaN or negative `maxLength`
  // truncated every text to "". Nothing threw; documents just stopped being
  // retrievable.
  assertPositiveInteger('batchSize', batchSize, 1);
  assertPositiveInteger('maxLength', maxLength, 1);

  const prepared = texts.map((text) =>
    truncateForEmbedding(text, onTruncate, maxLength),
  );

  const batches: string[][] = [];
  for (let i = 0; i < prepared.length; i += batchSize) {
    batches.push(prepared.slice(i, i + batchSize));
  }
  return batches;
}
