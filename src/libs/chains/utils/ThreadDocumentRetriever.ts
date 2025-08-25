import { VectorStore } from '@langchain/core/vectorstores';
import { Document as VectorStoreDocument } from '@langchain/core/documents';
import { Embeddings } from '@langchain/core/embeddings';
import { logger } from '@/app/lib/utils/logger';
import { ThreadDocumentUI } from '@/app/contracts/ThreadDocument';
import db from '@ragenai/prisma-client';

/**
 * Retriever that combines immediate access (inline content) with optimized vectorstore search
 * for thread-specific documents uploaded by users
 */
export class ThreadDocumentRetriever {
  private vectorStore: VectorStore;
  private embeddings: Embeddings;

  constructor(vectorStore: VectorStore, embeddings: Embeddings) {
    this.vectorStore = vectorStore;
    this.embeddings = embeddings;
  }

  /**
   * Retrieve relevant document chunks using dual strategy:
   * 1. Immediate access: Use inline content with on-demand embeddings
   * 2. Optimized access: Use pre-computed embeddings from vectorstore
   */
  async retrieveRelevantChunks(
    threadDocuments: ThreadDocumentUI[],
    query: string,
    maxChunks: number = 3
  ): Promise<VectorStoreDocument[]> {
    if (!threadDocuments || threadDocuments.length === 0) {
      logger.info('ThreadDocumentRetriever: No ThreadDocuments provided');
      return [];
    }

    try {
      logger.info(
        {
          threadDocumentsCount: threadDocuments.length,
          userFileIds: threadDocuments.map((doc) => doc.userFileId),
          documentsWithUserFileId: threadDocuments.filter(
            (doc) => doc.userFileId
          ).length,
          maxChunks,
          query: query.substring(0, 100),
        },
        'ThreadDocumentRetriever: Starting dual retrieval strategy'
      );

      // Filter documents that have userFileId for vectorstore search
      const documentsWithUserFileId = threadDocuments.filter(
        (doc) => doc.userFileId
      );

      // Strategy 1: Try vectorstore search with pre-computed embeddings (only for uploaded files)
      let vectorstoreResults: VectorStoreDocument[] = [];
      if (documentsWithUserFileId.length > 0) {
        vectorstoreResults = await this.searchVectorstore(
          documentsWithUserFileId,
          query,
          maxChunks
        );
      }

      // Strategy 2: If vectorstore has no results, use immediate access with inline content
      if (vectorstoreResults.length === 0) {
        logger.info(
          'ThreadDocumentRetriever: No vectorstore results, using immediate access'
        );
        return await this.searchInlineContent(
          threadDocuments,
          query,
          maxChunks
        );
      }

      logger.info(
        {
          vectorstoreResultsCount: vectorstoreResults.length,
          retrievedSources: vectorstoreResults.map(
            (doc) => doc.metadata?.file_name
          ),
        },
        'ThreadDocumentRetriever: Using vectorstore results'
      );

      return vectorstoreResults;
    } catch (error) {
      logger.error(
        {
          error,
          threadDocumentsCount: threadDocuments.length,
          userFileIds: threadDocuments.map((doc) => doc.userFileId),
        },
        'ThreadDocumentRetriever: Error during search, fallback to inline content'
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
    maxChunks: number
  ): Promise<VectorStoreDocument[]> {
    try {
      // Lookup internal UserFile.id from UserFile.public_id
      const userFilePublicIds = threadDocuments
        .map((doc) => doc.userFileId)
        .filter(Boolean) as string[];
      const userFiles = await db.userFile.findMany({
        where: {
          public_id: {
            in: userFilePublicIds,
          },
        },
        select: {
          id: true,
          public_id: true,
        },
      });

      if (userFiles.length === 0) {
        logger.warn(
          { userFilePublicIds },
          'ThreadDocumentRetriever: No UserFiles found for vectorstore search'
        );
        return [];
      }

      const internalUserFileIds = userFiles.map((file) => file.id);

      // Search vectorstore with file_id filter (Qdrant format)
      const qdrantFilter = {
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
        qdrantFilter
      );

      // Additional filtering to ensure results match our files
      const filteredResults = searchResults
        .filter((doc) => {
          const fileId = doc.metadata?.file_id;
          return fileId && internalUserFileIds.includes(fileId);
        })
        .slice(0, maxChunks);

      return filteredResults;
    } catch (error) {
      logger.error(
        { error },
        'ThreadDocumentRetriever: Vectorstore search failed'
      );
      return [];
    }
  }

  /**
   * Search using inline content with on-demand embeddings (immediate access)
   */
  private async searchInlineContent(
    threadDocuments: ThreadDocumentUI[],
    query: string,
    maxChunks: number
  ): Promise<VectorStoreDocument[]> {
    try {
      logger.info(
        'ThreadDocumentRetriever: Using immediate access with inline content'
      );

      // Generate query embedding
      const [queryEmbedding] = await this.embeddings.embedDocuments([query]);

      // Generate embeddings for all document contents
      const documentEmbeddings = await this.embeddings.embedDocuments(
        threadDocuments.map((doc) => doc.content)
      );

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
      const results = topResults.map(
        (result) =>
          new VectorStoreDocument({
            pageContent: result.document.content,
            metadata: {
              file_name: result.document.name,
              file_id: result.document.userFileId,
              source_type: 'thread_document_inline',
              similarity_score: result.similarity,
            },
          })
      );

      logger.info(
        {
          inlineResultsCount: results.length,
          topSimilarities: topResults.map((r) => r.similarity),
        },
        'ThreadDocumentRetriever: Generated inline content results'
      );

      return results;
    } catch (error) {
      logger.error(
        { error },
        'ThreadDocumentRetriever: Inline content search failed'
      );
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
