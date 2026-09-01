import type { BaseChatChainModels, ChainConfig } from './common';

export interface ConversationChainParams {
  models: BaseChatChainModels;
  config?: ConversationChainConfig;
}

// A distinct name for ChainConfig in the conversation chain: the alias is the
// point, so there are no members of its own to add.
export type ConversationChainConfig = ChainConfig;
