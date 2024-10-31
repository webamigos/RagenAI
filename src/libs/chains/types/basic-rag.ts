import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { RunnableBinding, RunnableConfig } from '@langchain/core/runnables';
import { VectorStore } from '@langchain/core/vectorstores';
import { BaseChain } from 'langchain/chains';

export interface BasicRagChainInput {
  question: string;
  chat_history: string | undefined;
}

export interface BasicRagChainParams {
  vectorStore: VectorStore;
  models: {
    contentModerator: BaseChain;
    questionRephraser: BaseChatModel;
    answerGenerator: BaseChatModel;
  };
  config?: BasicRagChainConfig;
}

export interface BasicRagChainOutput {
  chain: RunnableBinding<
    BasicRagChainInput,
    string,
    RunnableConfig<Record<string, any>>
  >;
  finalAnswerRunName: string;
}

export interface BasicRagChainConfig {
  retreivalMaxDocuments?: number;
  answerInstructions?: string | null;
}
