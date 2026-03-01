import { QdrantClient } from '@qdrant/js-client-rest';
import type { EmbeddingsProvider } from '@/libs/llm/types/embeddings';
import type { VectorStoreClient, VectorStoreDocument } from './types';
import { logger } from '@/app/lib/utils/logger';

export class QdrantVectorStoreClient implements VectorStoreClient {
  private client: QdrantClient;
  private collectionName: string;
  private embeddings: EmbeddingsProvider;

  constructor(
    embeddings: EmbeddingsProvider,
    config: {
      url?: string;
      apiKey?: string;
      collectionName: string;
    },
  ) {
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
    const queryEmbedding = await this.embeddings.embedQuery(query);

    const results = await this.client.query(this.collectionName, {
      query: queryEmbedding,
      limit: k,
      filter: filter as any,
      with_payload: true,
    });

    return results.points.map((point) => {
      const payload = (point.payload || {}) as Record<string, any>;
      return {
        pageContent:
          (payload.content as string) || (payload.pageContent as string) || '',
        metadata: (payload.metadata as Record<string, any>) || {},
      };
    });
  }

  async addDocuments(documents: VectorStoreDocument[]): Promise<void> {
    if (documents.length === 0) {
      return;
    }

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

    await this.client.upsert(this.collectionName, {
      points,
    });

    logger.info(
      { count: documents.length, collection: this.collectionName },
      'Documents added to Qdrant',
    );
  }

  static async fromExistingCollection(
    embeddings: EmbeddingsProvider,
    config: {
      url?: string;
      apiKey?: string;
      collectionName: string;
    },
  ): Promise<QdrantVectorStoreClient> {
    return new QdrantVectorStoreClient(embeddings, config);
  }
}
