import { logger } from '@/app/lib/utils/logger';
import type { VectorStoreDocument } from '@/libs/vector-store/types';

const RERANK_MODEL = process.env.RERANK_MODEL || 'cohere-rerank-v3-5';

const DEFAULT_RERANK_TOP_N = 5;

export interface RerankResult {
  index: number;
  relevanceScore: number;
  document: VectorStoreDocument;
}

/**
 * Check if reranking is available (LiteLLM proxy configured).
 */
export function isRerankingEnabled(): boolean {
  return (
    process.env.FEATURE_FLAG_RERANKING === '1' &&
    !!process.env.LITELLM_PROXY_URL
  );
}

/**
 * Rerank documents using Cohere Rerank v3.5 via LiteLLM proxy.
 *
 * Routes through LiteLLM's /rerank endpoint so costs, tokens, and Langfuse
 * traces are tracked automatically — same as chat completions and embeddings.
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

  const baseUrl = (
    process.env.LITELLM_PROXY_URL || 'http://localhost:4000'
  ).replace(/\/$/, '');
  const apiKey = process.env.LITELLM_MASTER_KEY || 'sk-litellm';

  const texts = documents.map((doc) => doc.pageContent);

  try {
    const response = await fetch(`${baseUrl}/rerank`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: RERANK_MODEL,
        query,
        documents: texts,
        top_n: topN,
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(
        `LiteLLM rerank failed (${response.status}): ${errorBody}`,
      );
    }

    const parsed = (await response.json()) as {
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
        model: RERANK_MODEL,
      },
      'Documents reranked via LiteLLM',
    );

    return reranked;
  } catch (error) {
    logger.error(
      { err: error, model: RERANK_MODEL },
      'Reranking failed, returning original documents',
    );
    // Graceful degradation: return original top-N without reranking
    return documents.slice(0, topN);
  }
}
