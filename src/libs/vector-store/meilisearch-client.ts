import { MeiliSearch } from 'meilisearch';
import type { EmbeddingsProvider } from '@/libs/llm/types/embeddings';
import type { VectorStoreClient, VectorStoreDocument } from './types';
import { logger } from '@/app/lib/utils/logger';

const EMBEDDER_NAME = 'custom';
const BATCH_SIZE = 1000;

interface MeilisearchConfig {
  url: string;
  apiKey?: string;
  indexName: string;
}

interface QdrantFilterCondition {
  key: string;
  match: { value: string | number };
}

interface QdrantFilter {
  must?: QdrantFilterCondition[];
  should?: QdrantFilterCondition[];
}

export class MeilisearchVectorStoreClient implements VectorStoreClient {
  private client: MeiliSearch;
  private indexName: string;
  private embeddings: EmbeddingsProvider;
  private indexConfigured = false;

  constructor(embeddings: EmbeddingsProvider, config: MeilisearchConfig) {
    this.client = new MeiliSearch({
      host: config.url,
      apiKey: config.apiKey,
    });
    this.indexName = config.indexName;
    this.embeddings = embeddings;
  }

  async similaritySearch(
    query: string,
    k: number,
    filter?: object
  ): Promise<VectorStoreDocument[]> {
    await this.ensureIndex();

    const queryEmbedding = await this.embeddings.embedQuery(query);
    const filterString = filter
      ? convertQdrantFilterToMeilisearch(filter as QdrantFilter)
      : undefined;

    const index = this.client.index(this.indexName);
    const results = await index.search(query, {
      limit: k,
      hybrid: {
        semanticRatio: 1.0,
        embedder: EMBEDDER_NAME,
      },
      vector: queryEmbedding,
      filter: filterString,
    });

    return results.hits.map((hit: Record<string, any>) => ({
      pageContent: (hit.content as string) || (hit.pageContent as string) || '',
      metadata: (hit.metadata as Record<string, any>) || {},
    }));
  }

  async addDocuments(documents: VectorStoreDocument[]): Promise<void> {
    if (documents.length === 0) return;

    await this.ensureIndex();

    const texts = documents.map((doc) => doc.pageContent);
    const embeddings = await this.embeddings.embedDocuments(texts);

    const meilisearchDocs = documents.map((doc, i) => ({
      id: crypto.randomUUID(),
      content: doc.pageContent,
      pageContent: doc.pageContent,
      metadata: doc.metadata,
      _vectors: {
        [EMBEDDER_NAME]: embeddings[i],
      },
    }));

    const index = this.client.index(this.indexName);

    // Batch upserts to avoid exceeding payload limits
    for (let i = 0; i < meilisearchDocs.length; i += BATCH_SIZE) {
      const batch = meilisearchDocs.slice(i, i + BATCH_SIZE);
      const task = await index.addDocuments(batch);
      await this.client.waitForTask(task.taskUid);
    }

    logger.info(
      { count: documents.length, index: this.indexName },
      'Documents added to Meilisearch'
    );
  }

  /**
   * Delete documents matching a filter from the index.
   * Uses Meilisearch's delete by filter API.
   */
  async deleteDocuments(filter: object): Promise<void> {
    await this.ensureIndex();

    const filterString = convertQdrantFilterToMeilisearch(
      filter as QdrantFilter
    );
    if (!filterString) {
      logger.warn('deleteDocuments called with empty filter, skipping');
      return;
    }

    const index = this.client.index(this.indexName);
    const task = await index.deleteDocuments({ filter: filterString });
    await this.client.waitForTask(task.taskUid);

    logger.info(
      { filter: filterString, index: this.indexName },
      'Documents deleted from Meilisearch'
    );
  }

  static async fromExistingIndex(
    embeddings: EmbeddingsProvider,
    config: MeilisearchConfig
  ): Promise<MeilisearchVectorStoreClient> {
    return new MeilisearchVectorStoreClient(embeddings, config);
  }

  private async ensureIndex(): Promise<void> {
    if (this.indexConfigured) return;

    const index = this.client.index(this.indexName);

    try {
      await this.client.getIndex(this.indexName);
    } catch {
      const task = await this.client.createIndex(this.indexName, {
        primaryKey: 'id',
      });
      await this.client.waitForTask(task.taskUid);
    }

    // Configure filterable attributes for metadata-based filtering
    const filterableTask = await index.updateFilterableAttributes([
      'metadata.project_id',
      'metadata.file_id',
      'metadata.organization_id',
    ]);
    await this.client.waitForTask(filterableTask.taskUid);

    // Configure embedder settings for vector/hybrid search
    // Must check current settings first — updating embedders fails if existing
    // documents lack vectors for the new embedder
    const currentEmbedders = await index.getEmbedders();
    if (!currentEmbedders || !(EMBEDDER_NAME in currentEmbedders)) {
      const embeddersTask = await index.updateEmbedders({
        [EMBEDDER_NAME]: {
          source: 'userProvided',
          dimensions: (await this.embeddings.embedQuery('test')).length,
        },
      });
      const taskResult = await this.client.waitForTask(embeddersTask.taskUid);
      if (taskResult.status === 'failed') {
        logger.error(
          { error: taskResult.error, index: this.indexName },
          'Failed to configure embedders — existing documents may lack vectors for this embedder'
        );
      }
    }

    this.indexConfigured = true;
  }
}

function convertQdrantFilterToMeilisearch(
  filter: QdrantFilter
): string | undefined {
  const parts: string[] = [];

  if (filter.must && filter.must.length > 0) {
    const mustParts = filter.must.map(
      (condition) => `${condition.key} = '${String(condition.match.value)}'`
    );
    parts.push(mustParts.join(' AND '));
  }

  if (filter.should && filter.should.length > 0) {
    const shouldParts = filter.should.map(
      (condition) => `${condition.key} = '${String(condition.match.value)}'`
    );
    parts.push(`(${shouldParts.join(' OR ')})`);
  }

  if (parts.length === 0) return undefined;
  return parts.join(' AND ');
}
