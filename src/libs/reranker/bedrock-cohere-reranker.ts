import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from '@aws-sdk/client-bedrock-runtime';
import { logger } from '@/app/lib/utils/logger';
import type { VectorStoreDocument } from '@/libs/vector-store/types';

const RERANK_MODEL_ID = process.env.RERANK_MODEL || 'cohere.rerank-v3-5:0';

const DEFAULT_RERANK_TOP_N = 5;

export interface RerankResult {
  index: number;
  relevanceScore: number;
  document: VectorStoreDocument;
}

let clientInstance: BedrockRuntimeClient | null = null;

function getClient(): BedrockRuntimeClient {
  if (!clientInstance) {
    clientInstance = new BedrockRuntimeClient({
      region: process.env.AWS_DEFAULT_REGION || 'eu-central-1',
    });
  }
  return clientInstance;
}

/**
 * Check if reranking is available (Bedrock credentials configured).
 * When AWS credentials are not set (e.g., local dev without Bedrock),
 * reranking is silently skipped.
 */
export function isRerankingEnabled(): boolean {
  return !!process.env.AWS_ACCESS_KEY_ID && !!process.env.AWS_SECRET_ACCESS_KEY;
}

/**
 * Rerank documents using Cohere Rerank v3.5 via AWS Bedrock.
 *
 * Takes a query and a list of documents retrieved from the vector store,
 * and returns the top-N most relevant documents sorted by relevance score.
 *
 * @param query - The user's search query (or rephrased standalone question)
 * @param documents - Documents from vector store similarity search
 * @param topN - Number of top results to return (default: 5)
 * @returns Reranked documents sorted by relevance score (descending)
 */
export async function rerankDocuments(
  query: string,
  documents: VectorStoreDocument[],
  topN: number = DEFAULT_RERANK_TOP_N,
): Promise<VectorStoreDocument[]> {
  if (documents.length === 0) {
    return [];
  }

  // If fewer documents than topN, no need to rerank
  if (documents.length <= topN) {
    return documents;
  }

  const client = getClient();
  const texts = documents.map((doc) => doc.pageContent);

  try {
    const response = await client.send(
      new InvokeModelCommand({
        modelId: RERANK_MODEL_ID,
        body: JSON.stringify({
          query,
          documents: texts,
          top_n: topN,
          return_documents: false,
        }),
        contentType: 'application/json',
        accept: 'application/json',
      }),
    );

    const parsed = JSON.parse(new TextDecoder().decode(response.body)) as {
      results: Array<{ index: number; relevance_score: number }>;
    };

    const reranked = parsed.results
      .sort((a, b) => b.relevance_score - a.relevance_score)
      .map((r) => documents[r.index]);

    logger.info(
      {
        inputCount: documents.length,
        outputCount: reranked.length,
        topScore: parsed.results[0]?.relevance_score,
      },
      'Documents reranked via Cohere Bedrock',
    );

    return reranked;
  } catch (error) {
    logger.error(
      { err: error, model: RERANK_MODEL_ID },
      'Reranking failed, returning original documents',
    );
    // Graceful degradation: return original top-N without reranking
    return documents.slice(0, topN);
  }
}
