import { logger } from '@/app/lib/utils/logger';
import type { VectorStoreDocument } from '@/libs/vector-store/types';
import { AiUsageStep } from '@/generated/prisma/client';
import { trackAiUsage } from '@/features/ai-usage/services/commands/create-ai-usage-command';

const RERANK_MODEL = process.env.RERANK_MODEL || 'cohere-rerank-v3-5';

export type RerankTrackingContext = {
  organizationId?: string | null;
  userId?: string | null;
  projectId?: string | null;
};

export type RerankOptions = {
  /** Number of top results to return (default: 5). */
  topN?: number;
  /** LiteLLM virtual key — attributes spend to the org in LiteLLM. */
  litellmApiKey?: string;
  /** Caller context — when present, the call is recorded in AiUsage. */
  tracking?: RerankTrackingContext;
};

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
  options: RerankOptions = {},
): Promise<VectorStoreDocument[]> {
  const { topN = DEFAULT_RERANK_TOP_N, litellmApiKey, tracking } = options;
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
  // Prefer the org's virtual LiteLLM key so usage is attributed to the org
  // in LiteLLM (Team / Key Name). Fall back to master key only if missing.
  const apiKey =
    litellmApiKey || process.env.LITELLM_MASTER_KEY || 'sk-litellm';

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
      usage?: { total_tokens?: number };
    };

    // Scaleway has always filtered these; this path did not, and until the
    // score was attached it got away with it — `documents[bad]` produced an
    // `undefined` entry rather than throwing. Reading `.metadata` off it does
    // throw, and the catch below would then discard every *valid* reranked
    // result and fall back to the unreranked top-N. One bad index from the
    // provider would silently turn reranking off for that turn.
    const validResults = parsed.results.filter(
      (r) =>
        Number.isInteger(r.index) &&
        r.index >= 0 &&
        r.index < documents.length &&
        documents[r.index] !== undefined,
    );
    const droppedCount = parsed.results.length - validResults.length;
    if (droppedCount > 0) {
      logger.warn(
        {
          droppedCount,
          documentCount: documents.length,
          rawIndices: parsed.results.map((r) => r.index),
        },
        'Cohere reranker returned out-of-range indices; dropping invalid entries',
      );
    }

    const reranked = validResults
      .sort((a, b) => b.relevance_score - a.relevance_score)
      // Same as the Scaleway path: the score travels on the document so the
      // return type stays "documents, better ordered".
      .map((r) => ({
        ...documents[r.index],
        metadata: {
          ...documents[r.index].metadata,
          relevance_score: r.relevance_score,
        },
      }));

    logger.info(
      {
        inputCount: documents.length,
        outputCount: reranked.length,
        topScore: parsed.results[0]?.relevance_score,
        model: RERANK_MODEL,
      },
      'Documents reranked via LiteLLM',
    );

    if (tracking?.organizationId) {
      // Scaleway returns `usage.total_tokens`; Bedrock Cohere bills per
      // search unit, not tokens, so fall back to a rough proxy: the sum of
      // pageContent characters / 4 (≈ token estimate).
      const tokens =
        parsed.usage?.total_tokens ??
        Math.ceil(
          texts.reduce((sum, t) => sum + t.length, 0) / 4 + query.length / 4,
        );
      void trackAiUsage({
        organizationId: tracking.organizationId,
        userId: tracking.userId,
        projectId: tracking.projectId,
        step: AiUsageStep.RERANKING,
        provider: 'litellm',
        model: RERANK_MODEL,
        inputTokens: tokens,
        outputTokens: 0,
        totalTokens: tokens,
      });
    }

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
