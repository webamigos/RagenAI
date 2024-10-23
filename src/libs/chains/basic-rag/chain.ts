import {
  RunnablePassthrough,
  RunnableSequence,
} from '@langchain/core/runnables';
import {
  generateFinalAnswer,
  moderateContent,
  rephraseQuestion,
  retrieveRelevantDocuments,
  sanitizeAndValidateInput,
} from './operations';
import { CHAIN_FINAL_ANSWER_RUN_NAME } from './config';
import type {
  BasicRagChainInput,
  BasicRagChainParams,
  BasicRagChainOutput,
} from '../types/basic-rag';

export const basicRagChain = ({
  vectorStore,
  models,
}: BasicRagChainParams): BasicRagChainOutput => {
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
