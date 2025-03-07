import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { BaseChain } from 'langchain/chains';

export interface ConversationChainParams {
  models: {
    contentModerator: BaseChain;
    answerGenerator: BaseChatModel;
  };
  config?: ConversationChainConfig;
}

export interface ConversationChainConfig {
  answerInstructions?: string | null;
  projectInstruction?: string;
}
