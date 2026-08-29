import { Logger } from '@nestjs/common';
// `@qdrant/js-client-rest`'s package.json `exports` map resolves to its ESM
// build under this project's `moduleResolution: nodenext` + CJS package
// type, *despite* a real, correctly-marked CJS build existing at
// dist/cjs/index.js (its own nested package.json declares
// `"type": "commonjs"`) — a `import`-statement resolution quirk, not a
// missing-build problem. Node's own `require()` resolves the exports map's
// "require" condition to that CJS build just fine (dynamic `import()` was
// tried first here and also failed, for an unrelated reason: ts-jest with
// `module: nodenext` doesn't downlevel it, so Jest needs
// --experimental-vm-modules to run it at all) — using plain `require()`
// keeps this file's runtime behavior identical to `tsc`'s own CJS output
// and sidesteps both problems.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { QdrantClient } = require('@qdrant/js-client-rest');
import type { EmbeddingsProvider } from '../llm/types/embeddings.js';
import type { VectorStoreClient, VectorStoreDocument } from './types.js';
import { encode as encodeBm25, type SparseVector } from './bm25-encoder.js';

const logger = new Logger('QdrantVectorStoreClient');

const BATCH_SIZE = 100;
// Default matches the current branch embedding model (Scaleway
// bge-multilingual-gemma2 = 3584). Override with VECTOR_SIZE=1024 only if
// you've reverted EMBEDDING_MODEL to cohere-embed-multilingual-v3 — a
// dim mismatch causes Qdrant to reject every upsert.
const VECTOR_SIZE = process.env.VECTOR_SIZE
  ? parseInt(process.env.VECTOR_SIZE, 10)
  : 3584;
const DENSE_VECTOR_NAME = 'dense';
const SPARSE_VECTOR_NAME = 'sparse';
/** Over-fetch multiplier per branch so RRF fusion has enough candidates. */
const PREFETCH_MULTIPLIER = 4;

/** Tracks collections already verified in this process to avoid redundant API calls. */
const verifiedCollections = new Set<string>();
/** In-flight verification promises to prevent concurrent duplicate creation. */
const inFlightVerifications = new Map<string, Promise<void>>();

interface QdrantConfig {
  url?: string;
  apiKey?: string;
  collectionName: string;
}

/**
 * Intermediate filter format used across the codebase.
 * Matches the format already used in initializeBasicRag.ts / Meilisearch client.
 */
interface IntermediateFilterCondition {
  key: string;
  match?: { value: string | number };
  match_any?: { values: (string | number)[] };
  is_null?: boolean;
}

interface IntermediateFilter {
  must?: IntermediateFilterCondition[];
  should?: IntermediateFilterCondition[];
}

export class QdrantVectorStoreClient implements VectorStoreClient {
  private client;
  private collectionName: string;
  private embeddings: EmbeddingsProvider;
  private collectionVerified = false;

  constructor(embeddings: EmbeddingsProvider, config: QdrantConfig) {
    this.client = new QdrantClient({
      url: config.url,
      apiKey: config.apiKey,
    });
    this.collectionName = config.collectionName;
    this.embeddings = embeddings;
  }

  /**
   * Hybrid search: runs dense (Cohere) and sparse (BM25) retrieval in parallel
   * on the Qdrant server and fuses results with Reciprocal Rank Fusion.
   *
   * If the query has no sparse signal (e.g., punctuation only), falls back to
   * dense-only search.
   */
  async similaritySearch(
    query: string,
    k: number,
    filter?: object,
  ): Promise<VectorStoreDocument[]> {
    await this.ensureCollection();

    const [denseVector, sparseVector] = await Promise.all([
      this.embeddings.embedQuery(query),
      Promise.resolve(encodeBm25(query)),
    ]);

    const qdrantFilter = filter ? convertToQdrantFilter(filter) : undefined;

    const prefetchLimit = k * PREFETCH_MULTIPLIER;
    const prefetch: Record<string, unknown>[] = [
      {
        query: denseVector,
        using: DENSE_VECTOR_NAME,
        limit: prefetchLimit,
        filter: qdrantFilter,
      },
    ];

    if (sparseVector.indices.length > 0) {
      prefetch.push({
        query: sparseVector,
        using: SPARSE_VECTOR_NAME,
        limit: prefetchLimit,
        filter: qdrantFilter,
      });
    }

    const results = await this.client.query(this.collectionName, {
      prefetch,
      query: { fusion: 'rrf' },
      limit: k,
      with_payload: true,
    });

    return results.points.map((point) => {
      const payload = (point.payload || {}) as Record<string, unknown>;
      return {
        pageContent:
          (payload.content as string) || (payload.pageContent as string) || '',
        metadata: (payload.metadata as Record<string, unknown>) || {},
      };
    });
  }

  async addDocuments(documents: VectorStoreDocument[]): Promise<void> {
    if (documents.length === 0) {
      return;
    }

    await this.ensureCollection();

    const texts = documents.map((doc) => doc.pageContent);
    const denseEmbeddings = await this.embeddings.embedDocuments(texts);

    const points = documents.map((doc, i) => {
      const sparse = encodeBm25(doc.pageContent);
      const vector: Record<string, number[] | SparseVector> = {
        [DENSE_VECTOR_NAME]: denseEmbeddings[i],
      };
      // Skip sparse vector for chunks with no tokens (pure numbers/punctuation).
      // Qdrant accepts partial named vectors — the point is still retrievable via dense.
      if (sparse.indices.length > 0) {
        vector[SPARSE_VECTOR_NAME] = sparse;
      }
      return {
        id: crypto.randomUUID(),
        vector,
        payload: {
          content: doc.pageContent,
          pageContent: doc.pageContent,
          metadata: doc.metadata,
        },
      };
    });

    // Batch upserts to avoid payload size limits
    for (let i = 0; i < points.length; i += BATCH_SIZE) {
      const batch = points.slice(i, i + BATCH_SIZE);
      await this.client.upsert(this.collectionName, {
        points: batch,
        wait: true,
      });
    }

    logger.log(
      `Documents added to Qdrant (hybrid: dense + sparse): count=${documents.length} collection=${this.collectionName}`,
    );
  }

  async deleteDocuments(filter: object): Promise<void> {
    await this.ensureCollection();

    const qdrantFilter = convertToQdrantFilter(filter);
    if (!qdrantFilter) {
      logger.warn('deleteDocuments called with empty filter, skipping');
      return;
    }

    await this.client.delete(this.collectionName, {
      filter: qdrantFilter,
      wait: true,
    });

    logger.log(
      `Documents deleted from Qdrant: collection=${this.collectionName}`,
    );
  }

  /**
   * Update metadata for documents matching a filter.
   * Used for syncing accessible_by permissions.
   */
  async updatePayload(
    filter: object,
    payload: Record<string, unknown>,
  ): Promise<void> {
    await this.ensureCollection();

    const qdrantFilter = convertToQdrantFilter(filter);
    if (!qdrantFilter) {
      return;
    }

    await this.client.setPayload(this.collectionName, {
      payload,
      filter: qdrantFilter,
      wait: true,
    });
  }

  /**
   * Scroll through all points matching a filter, returning payload only.
   * Used for batch operations like backfilling metadata.
   */
  async scrollPoints(
    filter: object,
    limit: number = 100,
    offset?: string | number,
  ): Promise<{
    points: Array<{ id: string | number; payload: Record<string, unknown> }>;
    nextOffset?: string | number;
  }> {
    await this.ensureCollection();

    const qdrantFilter = convertToQdrantFilter(filter);

    const result = await this.client.scroll(this.collectionName, {
      filter: qdrantFilter ?? undefined,
      limit,
      offset: offset ?? undefined,
      with_payload: true,
      with_vector: false,
    });

    return {
      points: result.points.map((p) => ({
        id: p.id,
        payload: (p.payload || {}) as Record<string, unknown>,
      })),
      nextOffset:
        (result.next_page_offset as string | number | undefined) ?? undefined,
    };
  }

  // eslint-disable-next-line @typescript-eslint/require-await -- async for interface parity, nothing here needs to await
  static async fromExistingCollection(
    embeddings: EmbeddingsProvider,
    config: QdrantConfig,
  ): Promise<QdrantVectorStoreClient> {
    return new QdrantVectorStoreClient(embeddings, config);
  }

  private async ensureCollection(): Promise<void> {
    if (this.collectionVerified) {
      return;
    }
    if (verifiedCollections.has(this.collectionName)) {
      this.collectionVerified = true;
      return;
    }

    // Deduplicate concurrent calls for the same collection
    const existing = inFlightVerifications.get(this.collectionName);
    if (existing) {
      await existing;
      this.collectionVerified = true;
      return;
    }

    const promise = this.createCollectionIfNeeded();
    inFlightVerifications.set(this.collectionName, promise);

    try {
      await promise;
      verifiedCollections.add(this.collectionName);
      this.collectionVerified = true;
    } finally {
      inFlightVerifications.delete(this.collectionName);
    }
  }

  private async createCollectionIfNeeded(): Promise<void> {
    const exists = await this.client.collectionExists(this.collectionName);
    if (exists.exists) {
      return;
    }

    await this.client.createCollection(this.collectionName, {
      vectors: {
        [DENSE_VECTOR_NAME]: {
          size: VECTOR_SIZE,
          distance: 'Cosine',
        },
      },
      sparse_vectors: {
        [SPARSE_VECTOR_NAME]: {
          // Qdrant computes IDF from stored TFs and scores BM25-style at query time.
          modifier: 'idf',
        },
      },
      optimizers_config: {
        indexing_threshold: 20000,
      },
    });

    // Create payload indexes for filterable metadata fields
    const indexFields = [
      'metadata.project_id',
      'metadata.file_id',
      'metadata.organization_id',
      'metadata.accessible_by',
    ];

    for (const field of indexFields) {
      await this.client.createPayloadIndex(this.collectionName, {
        field_name: field,
        field_schema: 'keyword',
      });
    }

    logger.log(
      `Qdrant collection created with hybrid dense+sparse vectors and payload indexes: ${this.collectionName}`,
    );
  }
}

/**
 * Convert the intermediate filter format (used across the codebase)
 * to Qdrant's native filter format.
 *
 * Intermediate: { must: [{ key, match/match_any/is_null }], should: [...] }
 * Qdrant:       { must: [{ key, match: { value/any } } | { is_null: { key } }], should: [...] }
 */
function convertCondition(
  condition: IntermediateFilterCondition,
): Record<string, unknown> {
  if (condition.is_null) {
    return {
      is_null: { key: condition.key },
    };
  }
  if (condition.match_any) {
    return {
      key: condition.key,
      match: { any: condition.match_any.values },
    };
  }
  if (condition.match) {
    return {
      key: condition.key,
      match: { value: condition.match.value },
    };
  }
  return {};
}

function convertToQdrantFilter(
  filter: IntermediateFilter,
): Record<string, unknown> | undefined {
  const result: Record<string, unknown[]> = {};

  if (filter.must && filter.must.length > 0) {
    result.must = filter.must.map(convertCondition);
  }

  if (filter.should && filter.should.length > 0) {
    result.should = filter.should.map(convertCondition);
  }

  if (Object.keys(result).length === 0) {
    return undefined;
  }

  return result;
}
