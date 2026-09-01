import type { RagChainModels, RagChainConfig } from './common.js';
import type { VectorStoreClient } from '../../vector-store/types.js';

export interface BasicRagChainParams {
  vectorStore: VectorStoreClient;
  models: RagChainModels;
  config?: RagChainConfig;
}
