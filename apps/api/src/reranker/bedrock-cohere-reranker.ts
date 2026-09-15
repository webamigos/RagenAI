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
 * Whether the Cohere rerank path is available.
 *
 * `RERANK_COHERE_BASE_URL` is what makes this variant survive B6. It has always
 * routed through `LITELLM_PROXY_URL`, which that phase deletes — and the
 * failure would have been silent, because an unreachable reranker degrades to
 * "no reranking" rather than erroring. Q6 calls this out by name: the endpoint
 * has to become configuration either way.
 *
 * The `LITELLM_PROXY_URL` fallback went with the proxy in B6. A deployment
 * that reranked through it must now name the endpoint: `RERANK_COHERE_BASE_URL`
 * pointed at Cohere, at a gateway, or at a proxy it still runs of its own
 * accord.
 */
export function isRerankingEnabled(): boolean {
  return process.env.FEATURE_FLAG_RERANKING === '1' && !!cohereBaseUrl();
}

/**
 * Where the `/rerank` call goes. Any endpoint speaking Cohere's rerank shape —
 * a LiteLLM proxy that has it registered, Cohere directly, or a gateway in
 * front of either.
 */
function cohereBaseUrl(): string | undefined {
  return process.env.RERANK_COHERE_BASE_URL;
}

/**
 * The rerank endpoint, and who is actually being billed for it.
 *
 * Cohere's own API versions its path — `/v2/rerank` — while a LiteLLM proxy and
 * the gateways that sit in front of one expose a bare `/rerank`. Appending
 * `/rerank` unconditionally 404s against "Cohere directly", which is one of the
 * three targets the comment above advertises.
 *
 * The provider travels with the choice rather than being assumed, because
 * `ai_usage.provider` is the column an operator reconciles an invoice against:
 * a call Cohere billed, recorded as `litellm`, is wrong there in a way no error
 * surfaces. Anything that is not Cohere's own host stays `litellm`, which is
 * what those rows have always said and what the proxy path still is.
 */
export function rerankEndpoint(baseUrl: string | undefined): {
  url: string;
  provider: string;
} {
  const base = (baseUrl ?? 'http://localhost:4000').replace(/\/$/, '');

  let host = '';
  try {
    host = new URL(base).hostname;
  } catch {
    // Not a parseable URL — treat it as the proxy-shaped path it used to be.
    return { url: `${base}/rerank`, provider: 'litellm' };
  }

  if (!/(^|\.)cohere\.(ai|com)$/i.test(host)) {
    return { url: `${base}/rerank`, provider: 'litellm' };
  }

  // An operator who already named a version in the URL means that version.
  const versioned = /\/v\d+$/.test(base);
  return {
    url: versioned ? `${base}/rerank` : `${base}/v2/rerank`,
    provider: 'cohere',
  };
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
  const { topN = DEFAULT_RERANK_TOP_N, tracking, trackAiUsage } = options;
  if (documents.length === 0) {
    return [];
  }

  // If fewer documents than topN, no need to rerank
  if (documents.length <= topN) {
    return documents;
  }

  const { url: rerankUrl, provider: rerankProvider } =
    rerankEndpoint(cohereBaseUrl());
  // Its own key, falling back to the proxy's while the proxy still exists.
  // Per-org virtual keys carried LiteLLM's own budget, which Phase A moved
  // into the database (B5) — nothing is left for a per-org key to do here, and
  // `ai_usage` already attributes the call.
  const apiKey =
    process.env.RERANK_COHERE_API_KEY ||
    process.env.LITELLM_MASTER_KEY ||
    'sk-litellm';

  const texts = documents.map((doc) => doc.pageContent);

  try {
    const response = await fetch(rerankUrl, {
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
        provider: rerankProvider,
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
