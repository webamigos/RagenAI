import type { BaseChatChainModels, ChainConfig } from './common';

export interface ConversationChainParams {
  models: BaseChatChainModels;
  config?: ConversationChainConfig;
}

export interface ConversationChainConfig extends ChainConfig {}
