import {
  COHERE_RERANK_MODEL,
  rerankDocuments as rerankDocumentsBedrock,
  isRerankingEnabled as isBedrockRerankingEnabled,
  type RerankOptions,
  type RerankResult,
  type RerankTrackingContext,
} from './bedrock-cohere-reranker';
import {
  SCALEWAY_RERANK_MODEL,
  rerankDocumentsScaleway,
  isScalewayRerankingEnabled,
} from './scaleway-reranker';
import type { VectorStoreDocument } from '@/libs/vector-store/types';

export type { RerankOptions, RerankResult, RerankTrackingContext };

/**
 * Provider selection:
 *   RERANK_PROVIDER=cohere   → whatever `RERANK_COHERE_BASE_URL` names, speaking
 *                              Cohere's rerank shape (opt-in only)
 *   RERANK_PROVIDER=scaleway → Scaleway /v1/rerank (qwen3-embedding-8b)
 *   unset                     → scaleway (current default; the gateway route
 *                               table carries no rerank model, and B6 removed
 *                               the proxy the cohere path used to reach)
 */
function getProvider(): 'scaleway' | 'cohere' {
  return process.env.RERANK_PROVIDER === 'cohere' ? 'cohere' : 'scaleway';
}

/** Which reranker a turn used, for the stream's `retrieval` frame. */
export function rerankProviderName(): 'scaleway' | 'cohere' {
  return getProvider();
}

/**
 * The model the active provider reranks with — the same value its usage rows
 * record. The RAG settings page shows it, and used to show a literal
 * `cohere-rerank-v3-5` long after Scaleway became the default.
 */
export function rerankModelName(): string {
  return getProvider() === 'scaleway'
    ? SCALEWAY_RERANK_MODEL
    : COHERE_RERANK_MODEL;
}

export function isRerankingEnabled(): boolean {
  return getProvider() === 'scaleway'
    ? isScalewayRerankingEnabled()
    : isBedrockRerankingEnabled();
}

export async function rerankDocuments(
  query: string,
  documents: VectorStoreDocument[],
  options: RerankOptions = {},
): Promise<VectorStoreDocument[]> {
  if (getProvider() === 'scaleway') {
    return rerankDocumentsScaleway(query, documents, {
      topN: options.topN,
      tracking: options.tracking,
    });
  }
  return rerankDocumentsBedrock(query, documents, options);
}
