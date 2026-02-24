import type { SupabaseClient } from '@supabase/supabase-js';
import type { EmbeddingsProvider } from '@/libs/llm/types/embeddings';
import type { VectorStoreClient, VectorStoreDocument } from './types';
import { logger } from '@/app/lib/utils/logger';

export class SupabaseVectorStoreClient implements VectorStoreClient {
  private client: SupabaseClient;
  private embeddings: EmbeddingsProvider;
  private queryName: string;
  private tableName: string;
  private filter?: Record<string, any>;

  constructor(
    embeddings: EmbeddingsProvider,
    config: {
      client: SupabaseClient;
      queryName: string;
      tableName?: string;
      filter?: Record<string, any>;
    }
  ) {
    this.client = config.client;
    this.embeddings = embeddings;
    this.queryName = config.queryName;
    this.tableName = config.tableName || 'documents';
    this.filter = config.filter;
  }

  async similaritySearch(
    query: string,
    k: number,
    filter?: object
  ): Promise<VectorStoreDocument[]> {
    const queryEmbedding = await this.embeddings.embedQuery(query);

    const effectiveFilter = filter || this.filter || {};

    const { data, error } = await this.client.rpc(this.queryName, {
      query_embedding: queryEmbedding,
      match_count: k,
      filter: effectiveFilter,
    });

    if (error) {
      logger.error({ err: error }, 'Supabase similarity search failed');
      throw error;
    }

    return (data || []).map((row: any) => ({
      pageContent: row.content || '',
      metadata: row.metadata || {},
    }));
  }

  async addDocuments(documents: VectorStoreDocument[]): Promise<void> {
    if (documents.length === 0) return;

    const texts = documents.map((doc) => doc.pageContent);
    const embeddings = await this.embeddings.embedDocuments(texts);

    const rows = documents.map((doc, i) => ({
      content: doc.pageContent,
      metadata: doc.metadata,
      embedding: embeddings[i],
    }));

    const { error } = await this.client.from(this.tableName).insert(rows);

    if (error) {
      logger.error({ err: error }, 'Supabase document insertion failed');
      throw error;
    }

    logger.info(
      { count: documents.length },
      'Documents added to Supabase vector store'
    );
  }

  async addVectors(
    vectors: number[][],
    documents: VectorStoreDocument[]
  ): Promise<void> {
    const rows = documents.map((doc, i) => ({
      content: doc.pageContent,
      metadata: doc.metadata,
      embedding: vectors[i],
    }));

    const { error } = await this.client.from(this.tableName).insert(rows);

    if (error) {
      logger.error({ err: error }, 'Supabase vector insertion failed');
      throw error;
    }
  }
}
