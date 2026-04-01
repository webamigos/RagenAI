import { QdrantClient } from '@qdrant/js-client-rest';
import type { EmbeddingsProvider } from '@/libs/llm/types/embeddings';
import type { VectorStoreClient, VectorStoreDocument } from './types';
import { logger } from '@/app/lib/utils/logger';

const BATCH_SIZE = 100;
const VECTOR_SIZE = 1024; // Cohere embed-multilingual-v3

/** Tracks collections already verified in this process to avoid redundant API calls. */
const verifiedCollections = new Set<string>();

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
  private client: QdrantClient;
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

  async similaritySearch(
    query: string,
    k: number,
    filter?: object,
  ): Promise<VectorStoreDocument[]> {
    await this.ensureCollection();

    const queryEmbedding = await this.embeddings.embedQuery(query);
    const qdrantFilter = filter
      ? convertToQdrantFilter(filter as IntermediateFilter)
      : undefined;

    const results = await this.client.query(this.collectionName, {
      query: queryEmbedding,
      limit: k,
      filter: qdrantFilter,
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
    const embeddings = await this.embeddings.embedDocuments(texts);

    const points = documents.map((doc, i) => ({
      id: crypto.randomUUID(),
      vector: embeddings[i],
      payload: {
        content: doc.pageContent,
        pageContent: doc.pageContent,
        metadata: doc.metadata,
      },
    }));

    // Batch upserts to avoid payload size limits
    for (let i = 0; i < points.length; i += BATCH_SIZE) {
      const batch = points.slice(i, i + BATCH_SIZE);
      await this.client.upsert(this.collectionName, {
        points: batch,
        wait: true,
      });
    }

    logger.info(
      { count: documents.length, collection: this.collectionName },
      'Documents added to Qdrant',
    );
  }

  async deleteDocuments(filter: object): Promise<void> {
    await this.ensureCollection();

    const qdrantFilter = convertToQdrantFilter(filter as IntermediateFilter);
    if (!qdrantFilter) {
      logger.warn('deleteDocuments called with empty filter, skipping');
      return;
    }

    await this.client.delete(this.collectionName, {
      filter: qdrantFilter,
      wait: true,
    });

    logger.info(
      { collection: this.collectionName },
      'Documents deleted from Qdrant',
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

    const qdrantFilter = convertToQdrantFilter(filter as IntermediateFilter);
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

    const qdrantFilter = convertToQdrantFilter(filter as IntermediateFilter);

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

    const exists = await this.client.collectionExists(this.collectionName);
    if (!exists.exists) {
      await this.client.createCollection(this.collectionName, {
        vectors: {
          size: VECTOR_SIZE,
          distance: 'Cosine',
        },
        optimizers_config: {
          indexing_threshold: 20000,
        },
      });

      // Create payload indexes for filterable metadata fields
      const indexFields = [
        'metadata.project_id',
        'metadata.project_public_id',
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

      logger.info(
        { collection: this.collectionName },
        'Qdrant collection created with payload indexes',
      );
    }

    verifiedCollections.add(this.collectionName);
    this.collectionVerified = true;
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
