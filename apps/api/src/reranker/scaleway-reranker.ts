import { Logger } from '@nestjs/common';
import type { VectorStoreDocument } from '../vector-store/types.js';
import type { RerankOptions } from './bedrock-cohere-reranker.js';

const logger = new Logger('ScalewayReranker');

const RERANK_MODEL = process.env.RERANK_MODEL || 'qwen3-embedding-8b';
const DEFAULT_RERANK_TOP_N = 5;
const MAX_RERANK_MS = 15_000;

/**
 * Rerank using Scaleway's Generative APIs `/v1/rerank` endpoint directly,
 * bypassing LiteLLM. LiteLLM's `cohere/` adapter targets Cohere's `/v2/rerank`,
 * which Scaleway does not expose — Scaleway is `/v1/rerank` only.
 *
 * Endpoint: `${SCW_API_BASE}/rerank` (e.g. https://api.scaleway.ai/<project>/v1/rerank)
 * Auth:     `Authorization: Bearer ${SCW_API_KEY}`
 *
 * Request/response shape matches the Cohere/Jina rerank format used by the
 * Bedrock-Cohere reranker, so behavior in callers is identical aside from
 * the upstream provider.
 *
 * NOTE: Scaleway's qwen3-embedding-8b "rerank" is a bi-encoder (cosine on
 * embeddings), not a true cross-encoder. Quality is lower than Cohere v3.5.
 */
export async function rerankDocumentsScaleway(
  query: string,
  documents: VectorStoreDocument[],
  options: Omit<RerankOptions, 'litellmApiKey'> = {},
): Promise<VectorStoreDocument[]> {
  const { topN = DEFAULT_RERANK_TOP_N, tracking, trackAiUsage } = options;
  // litellmApiKey is intentionally ignored — Scaleway path bypasses LiteLLM.
  if (documents.length === 0) {
    return [];
  }
  if (documents.length <= topN) {
    return documents;
  }

  const baseUrl = process.env.SCW_API_BASE?.replace(/\/$/, '');
  const apiKey = process.env.SCW_API_KEY;

  if (!baseUrl) {
    throw new Error('SCW_API_BASE is required for the Scaleway reranker');
  }
  if (!apiKey) {
    throw new Error('SCW_API_KEY is required for the Scaleway reranker');
  }

  const texts = documents.map((doc) => doc.pageContent);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), MAX_RERANK_MS);

  try {
    let response: Response;
    try {
      response = await fetch(`${baseUrl}/rerank`, {
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
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(
        `Scaleway rerank failed (${response.status}): ${errorBody}`,
      );
    }

    const parsed = (await response.json()) as {
      results: Array<{ index: number; relevance_score: number }>;
      usage?: { total_tokens?: number };
    };

    // Defensive: Scaleway has occasionally returned indices out of range.
    // Drop any malformed entries instead of letting `undefined` slip into
    // combineDocuments downstream.
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
        `Scaleway reranker returned out-of-range indices; dropping invalid entries: droppedCount=${droppedCount} documentCount=${documents.length}`,
      );
    }

    const reranked = validResults
      .sort((a, b) => b.relevance_score - a.relevance_score)
      .map((r) => documents[r.index]);

    logger.log(
      `Documents reranked via Scaleway: inputCount=${documents.length} outputCount=${reranked.length} model=${RERANK_MODEL}`,
    );

    if (tracking?.organizationId && trackAiUsage) {
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
        provider: 'scaleway',
        model: RERANK_MODEL,
        inputTokens: tokens,
        outputTokens: 0,
        totalTokens: tokens,
      });
    }

    return reranked;
  } catch (error) {
    logger.error('Scaleway reranking failed, returning original documents', {
      err: error,
      model: RERANK_MODEL,
    });
    return documents.slice(0, topN);
  }
}

/**
 * Whether the Scaleway reranker can run (env present).
 */
export function isScalewayRerankingEnabled(): boolean {
  return (
    process.env.FEATURE_FLAG_RERANKING === '1' &&
    !!process.env.SCW_API_BASE &&
    !!process.env.SCW_API_KEY
  );
}
