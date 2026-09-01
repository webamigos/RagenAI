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
 *   RERANK_PROVIDER=cohere   → LiteLLM /rerank (Bedrock Cohere v3.5 — opt-in only)
 *   RERANK_PROVIDER=scaleway → Scaleway /v1/rerank (qwen3-embedding-8b)
 *   unset                     → scaleway (current default; cohere-rerank-v3-5
 *                               is no longer registered in infra/litellm/config.yaml)
 */
function getProvider(): 'scaleway' | 'cohere' {
  return process.env.RERANK_PROVIDER === 'cohere' ? 'cohere' : 'scaleway';
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
