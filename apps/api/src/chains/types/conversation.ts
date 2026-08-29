import type { BaseChatChainModels, ChainConfig } from './common.js';

export interface ConversationChainParams {
  models: BaseChatChainModels;
  config?: ConversationChainConfig;
}

// Not `interface X extends Y {}` (empty extension) — same shape as ChainConfig
// today; kept as its own alias so conversation-chain (not ported in this
// slice) can diverge later without touching ChainConfig itself.
export type ConversationChainConfig = ChainConfig;
