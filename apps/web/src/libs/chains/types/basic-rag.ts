import type { RagChainModels, RagChainConfig } from './common';

export interface BasicRagChainParams {
  vectorStore: import('@/libs/vector-store/types').VectorStoreClient;
  models: RagChainModels;
  config?: RagChainConfig;
}
