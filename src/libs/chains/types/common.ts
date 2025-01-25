import { RunnableBinding, RunnableConfig } from '@langchain/core/runnables';

export interface BaseChatChainInput {
  question: string;
  chat_history: string | undefined;
}

export interface BaseChatChainOutput {
  chain: RunnableBinding<
    BaseChatChainInput,
    string,
    RunnableConfig<Record<string, any>>
  >;
  finalAnswerRunName: string;
}
