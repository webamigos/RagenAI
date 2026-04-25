import {
  rerankDocuments as rerankDocumentsBedrock,
  isRerankingEnabled as isBedrockRerankingEnabled,
  type RerankOptions,
  type RerankResult,
  type RerankTrackingContext,
} from './bedrock-cohere-reranker';
import {
  rerankDocumentsScaleway,
  isScalewayRerankingEnabled,
} from './scaleway-reranker';
import type { VectorStoreDocument } from '@/libs/vector-store/types';

export type { RerankOptions, RerankResult, RerankTrackingContext };

/**
 * Provider selection:
 *   RERANK_PROVIDER=scaleway → Scaleway /v1/rerank (qwen3-embedding-8b)
 *   RERANK_PROVIDER=cohere   → LiteLLM /rerank (default — Bedrock Cohere v3.5)
 *   unset                     → cohere (back-compat)
 */
function getProvider(): 'scaleway' | 'cohere' {
  return process.env.RERANK_PROVIDER === 'scaleway' ? 'scaleway' : 'cohere';
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
