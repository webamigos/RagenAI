import { Logger } from '@nestjs/common';
import type {
  VectorStoreClient,
  VectorStoreDocument,
} from '../../vector-store/types.js';
import type { EmbeddingsProvider } from '../../llm/types/embeddings.js';
import { type ThreadDocumentUI } from '../types/thread-document.js';

const logger = new Logger('ThreadDocumentRetriever');

/**
 * Retriever that combines immediate access (inline content) with optimized vectorstore search
 * for thread-specific documents uploaded by users
 */
export class ThreadDocumentRetriever {
  private vectorStore: VectorStoreClient;
  private embeddings: EmbeddingsProvider;
  private cachedDocumentEmbeddings: Map<string, number[]> = new Map();

  constructor(vectorStore: VectorStoreClient, embeddings: EmbeddingsProvider) {
    this.vectorStore = vectorStore;
    this.embeddings = embeddings;
  }

  /**
   * Build a stable, unique cache key for a thread document.
   * Documents with a userFileId use that; inline documents use name + content length
   * to avoid collisions between documents sharing the same name.
   */
  private documentCacheKey(doc: ThreadDocumentUI): string {
    if (doc.userFileId) {
      return doc.userFileId;
    }
    return `${doc.name}:${doc.size}:${doc.content.length}`;
  }

  /**
   * Retrieve relevant document chunks using dual strategy:
   * 1. Immediate access: Use inline content with on-demand embeddings
   * 2. Optimized access: Use pre-computed embeddings from vectorstore
   */
  async retrieveRelevantChunks(
    threadDocuments: ThreadDocumentUI[],
    query: string,
    maxChunks: number = 3,
  ): Promise<VectorStoreDocument[]> {
    if (!threadDocuments || threadDocuments.length === 0) {
      logger.log('ThreadDocumentRetriever: No ThreadDocuments provided');
      return [];
    }

    try {
      logger.log('ThreadDocumentRetriever: Starting dual retrieval strategy', {
        threadDocumentsCount: threadDocuments.length,
        userFileIds: threadDocuments.map((doc) => doc.userFileId),
        documentsWithUserFileId: threadDocuments.filter((doc) => doc.userFileId)
          .length,
        maxChunks,
        query: query.substring(0, 100),
      });

      // Filter documents that have userFileId for vectorstore search
      const documentsWithUserFileId = threadDocuments.filter(
        (doc) => doc.userFileId,
      );

      // Strategy 1: Try vectorstore search with pre-computed embeddings (only for uploaded files)
      let vectorstoreResults: VectorStoreDocument[] = [];
      if (documentsWithUserFileId.length > 0) {
        vectorstoreResults = await this.searchVectorstore(
          documentsWithUserFileId,
          query,
          maxChunks,
        );
      }

      // Strategy 2: If vectorstore has no results, use immediate access with inline content
      if (vectorstoreResults.length === 0) {
        logger.log(
          'ThreadDocumentRetriever: No vectorstore results, using immediate access',
        );
        return await this.searchInlineContent(
          threadDocuments,
          query,
          maxChunks,
        );
      }

      logger.log('ThreadDocumentRetriever: Using vectorstore results', {
        vectorstoreResultsCount: vectorstoreResults.length,
        retrievedSources: vectorstoreResults.map(
          (doc) => doc.metadata?.fileName,
        ),
      });

      return vectorstoreResults;
    } catch (error) {
      logger.error(
        'ThreadDocumentRetriever: Error during search, fallback to inline content',
        {
          error,
          threadDocumentsCount: threadDocuments.length,
          userFileIds: threadDocuments.map((doc) => doc.userFileId),
        },
      );

      // Fallback: Use inline content if vectorstore fails
      return await this.searchInlineContent(threadDocuments, query, maxChunks);
    }
  }

  /**
   * Search using pre-computed embeddings in vectorstore
   */
  private async searchVectorstore(
    threadDocuments: ThreadDocumentUI[],
    query: string,
    maxChunks: number,
  ): Promise<VectorStoreDocument[]> {
    try {
      // Get UserFile IDs from thread documents
      const userFileIds = threadDocuments
        .map((doc) => doc.userFileId)
        .filter(Boolean) as string[];

      if (userFileIds.length === 0) {
        logger.warn(
          'ThreadDocumentRetriever: No UserFile IDs found for vectorstore search',
        );
        return [];
      }

      const internalUserFileIds = userFileIds;

      // Search vectorstore with fileId filter (intermediate format — works with all backends)
      const fileIdFilter = {
        should: internalUserFileIds.map((fileId) => ({
          key: 'metadata.file_id',
          match: {
            value: fileId,
          },
        })),
      };

      const searchResults = await this.vectorStore.similaritySearch(
        query,
        maxChunks * 2, // Get more results for better filtering
        fileIdFilter,
      );

      // Additional filtering to ensure results match our files
      // Metadata uses snake_case (file_id) — check both for safety
      const filteredResults = searchResults
        .filter((doc) => {
          const fileId = doc.metadata?.file_id ?? doc.metadata?.fileId;
          return fileId && internalUserFileIds.includes(fileId);
        })
        .slice(0, maxChunks);

      return filteredResults;
    } catch (error) {
      logger.error('ThreadDocumentRetriever: Vectorstore search failed', {
        error,
      });
      return [];
    }
  }

  /**
   * Search using inline content with on-demand embeddings (immediate access).
   * Document embeddings are cached per instance to avoid re-computing on every query.
   */
  private async searchInlineContent(
    threadDocuments: ThreadDocumentUI[],
    query: string,
    maxChunks: number,
  ): Promise<VectorStoreDocument[]> {
    try {
      logger.log(
        'ThreadDocumentRetriever: Using immediate access with inline content',
      );

      // Generate query embedding
      const queryEmbedding = await this.embeddings.embedQuery(query);

      // Generate embeddings for documents, using cache when available
      const uncachedDocs: { index: number; content: string }[] = [];
      for (let i = 0; i < threadDocuments.length; i++) {
        const cacheKey = this.documentCacheKey(threadDocuments[i]);
        if (!this.cachedDocumentEmbeddings.has(cacheKey)) {
          uncachedDocs.push({ index: i, content: threadDocuments[i].content });
        }
      }

      if (uncachedDocs.length > 0) {
        const newEmbeddings = await this.embeddings.embedDocuments(
          uncachedDocs.map((d) => d.content),
        );
        uncachedDocs.forEach((doc, j) => {
          const cacheKey = this.documentCacheKey(threadDocuments[doc.index]);
          this.cachedDocumentEmbeddings.set(cacheKey, newEmbeddings[j]);
        });
      }

      const documentEmbeddings = threadDocuments.map((doc) => {
        const cacheKey = this.documentCacheKey(doc);
        return this.cachedDocumentEmbeddings.get(cacheKey)!;
      });

      // Calculate similarities and rank documents
      const similarities = documentEmbeddings.map((docEmbedding, index) => ({
        index,
        similarity: this.cosineSimilarity(queryEmbedding, docEmbedding),
        document: threadDocuments[index],
      }));

      // Sort by similarity and take top results
      const topResults = similarities
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, maxChunks);

      // Convert to VectorStoreDocument format
      const results: VectorStoreDocument[] = topResults.map((result) => ({
        pageContent: result.document.content,
        metadata: {
          fileName: result.document.name,
          fileId: result.document.userFileId,
          source_type: 'thread_document_inline',
          similarity_score: result.similarity,
        },
      }));

      logger.log('ThreadDocumentRetriever: Generated inline content results', {
        inlineResultsCount: results.length,
        topSimilarities: topResults.map((r) => r.similarity),
      });

      return results;
    } catch (error) {
      logger.error('ThreadDocumentRetriever: Inline content search failed', {
        error,
      });
      return [];
    }
  }

  /**
   * Calculate cosine similarity between two vectors
   */
  private cosineSimilarity(a: number[], b: number[]): number {
    const dotProduct = a.reduce((sum, ai, i) => sum + ai * b[i], 0);
    const magnitudeA = Math.sqrt(a.reduce((sum, ai) => sum + ai * ai, 0));
    const magnitudeB = Math.sqrt(b.reduce((sum, bi) => sum + bi * bi, 0));
    return dotProduct / (magnitudeA * magnitudeB);
  }

  /**
   * Get statistics about thread documents
   */
  getThreadDocumentsStats(threadDocuments: ThreadDocumentUI[]): {
    totalFiles: number;
    fileNames: string[];
    totalSizeBytes: number;
    userFileIds: string[];
  } {
    return {
      totalFiles: threadDocuments.length,
      fileNames: threadDocuments.map((doc) => doc.name),
      totalSizeBytes: threadDocuments.reduce((sum, doc) => sum + doc.size, 0),
      userFileIds: threadDocuments
        .map((doc) => doc.userFileId)
        .filter(Boolean) as string[],
    };
  }
}
