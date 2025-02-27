import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { VectorStore } from '@langchain/core/vectorstores';
import { BaseChain } from 'langchain/chains';

export interface BasicRagChainParams {
  vectorStore: VectorStore;
  models: {
    contentModerator: BaseChain;
    questionRephraser: BaseChatModel;
    answerGenerator: BaseChatModel;
  };
  config?: BasicRagChainConfig;
}

export interface BasicRagChainConfig {
  maxDocumentsToRetrieve?: number;
  answerInstructions?: string | null;
}
