import { Logger } from '@nestjs/common';
import type { VectorStoreDocument } from '../vector-store/types.js';
import { type TrackAiUsage } from '../ai-usage/types.js';

const logger = new Logger('BedrockCohereReranker');

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
  /**
   * Optional injected callback instead of a global trackAiUsage import — keeps
   * this module framework-agnostic (no NestJS DI). See ai-usage/types.ts.
   * No-op (usage silently not recorded) if `tracking` is present but this
   * isn't provided.
   */
  trackAiUsage?: TrackAiUsage;
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
  const {
    topN = DEFAULT_RERANK_TOP_N,
    litellmApiKey,
    tracking,
    trackAiUsage,
  } = options;
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

    const reranked = parsed.results
      .sort((a, b) => b.relevance_score - a.relevance_score)
      .map((r) => documents[r.index]);

    logger.log(
      `Documents reranked via LiteLLM: inputCount=${documents.length} outputCount=${reranked.length} model=${RERANK_MODEL}`,
    );

    if (tracking?.organizationId && trackAiUsage) {
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
        step: 'RERANKING',
        provider: 'litellm',
        model: RERANK_MODEL,
        inputTokens: tokens,
        outputTokens: 0,
        totalTokens: tokens,
      });
    }

    return reranked;
  } catch (error) {
    logger.error('Reranking failed, returning original documents', {
      err: error,
      model: RERANK_MODEL,
    });
    // Graceful degradation: return original top-N without reranking
    return documents.slice(0, topN);
  }
}
