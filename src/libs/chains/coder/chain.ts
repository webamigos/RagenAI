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

/**
 * Creates a basic RAG (Retrieval-Augmented Generation) chain.
 *
 * @param {VectorStore} params.vectorStore - The vector store instance used for document retrieval.
 * @param {Object} params.models - LLM models used in the chain.
 * @param {ContentModerator} params.models.contentModerator - Model for content moderation, any BaseChain instance can be used.
 * @param {QuestionRephraser} params.models.questionRephraser - Model for rephrasing questions, any BaseChatModel instance can be used.
 * @param {AnswerGenerator} params.models.answerGenerator - Model for generating final answers, any BaseChatModel instance can be used.
 * @param {BasicRagChainConfig} params.config - Configuration for the chain.
 * @returns {BasicRagChainOutput} An object containing the chain and the final answer run name. Final answer run name can be used to filter events while stream processing.
 */
export const coderChain = ({
  vectorStore,
  models,
  config,
}: BasicRagChainParams): BasicRagChainOutput => {
  const chain = RunnableSequence.from<BasicRagChainInput, string>([
    sanitizeAndValidateInput,

    moderateContent(models.contentModerator),

    RunnablePassthrough.assign({
      standalone_question: rephraseQuestion(models.questionRephraser),
    }),

    RunnablePassthrough.assign({
      context: retrieveRelevantDocuments(
        vectorStore,
        config?.maxDocumentsToRetrieve
      ),
    }),

    generateFinalAnswer(
      models.answerGenerator,
      CHAIN_FINAL_ANSWER_RUN_NAME,
      config?.answerInstructions
    ),
  ]).withConfig({
    runName: 'Coder RAG chain',
  });

  return { chain, finalAnswerRunName: CHAIN_FINAL_ANSWER_RUN_NAME };
};
