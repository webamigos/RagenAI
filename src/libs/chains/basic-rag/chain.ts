import {
  RunnablePassthrough,
  RunnableSequence,
} from '@langchain/core/runnables';

import { BaseChain } from 'langchain/chains';
import { BasicRagChainInput } from '../types/chain';
import { CHAIN_FINAL_ANSWER_RUN_NAME } from './config';
import {
  generateFinalAnswer,
  moderateContent,
  rephraseQuestion,
  retrieveRelevantDocuments,
  sanitizeAndValidateInput,
} from './operations';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { VectorStore } from '@langchain/core/vectorstores';

type BasicRagChainParams = {
  vectorStore: VectorStore;
  models: {
    contentModerator: BaseChain;
    questionRephraser: BaseChatModel;
    answerGenerator: BaseChatModel;
  };
};

export const basicRagChain = ({ vectorStore, models }: BasicRagChainParams) => {
  const chain = RunnableSequence.from<BasicRagChainInput, string>([
    sanitizeAndValidateInput,

    moderateContent(models.contentModerator),

    RunnablePassthrough.assign({
      standalone_question: rephraseQuestion(models.questionRephraser),
    }),

    RunnablePassthrough.assign({
      context: retrieveRelevantDocuments(vectorStore),
    }),

    generateFinalAnswer(models.answerGenerator, CHAIN_FINAL_ANSWER_RUN_NAME),
  ]).withConfig({
    runName: 'Basic RAG chain',
  });

  return { chain, finalAnswerRunName: CHAIN_FINAL_ANSWER_RUN_NAME };
};
